package wedge

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/providers/importer"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ScanResult is the deterministic import summary (B2).
type ScanResult struct {
	FactCount     int32  `json:"fact_count"`
	EvidenceCount int32  `json:"evidence_count"`
	SourceCount   int32  `json:"source_count"`
	SkippedCount  int32  `json:"skipped_count"`
	Message       string `json:"message"`
}

// ScanProject discovers MVP sources under the project root and upserts evidence, facts, and knowledge sources.
func ScanProject(store *storepkg.Store, projectID string) (ScanResult, error) {
	if projectID == "" {
		return ScanResult{}, fmt.Errorf("project id is required")
	}
	project, err := store.GetProject(projectID)
	if errors.Is(err, sql.ErrNoRows) {
		return ScanResult{}, fmt.Errorf("unknown project")
	}
	if err != nil {
		return ScanResult{}, err
	}
	rootPath := ExpandRootPath(project.RootPath)
	if rootPath == "" {
		return ScanResult{}, fmt.Errorf("project root path is empty")
	}
	discovered, err := importer.Discover(rootPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ScanResult{}, fmt.Errorf("project root path does not exist")
		}
		return ScanResult{}, err
	}

	now := time.Now().UTC()
	var factCount, evidenceCount, sourceCount int32
	skipped := int32(discovered.Skipped)
	importedFiles := 0

	headID, gitEvidence, gitNote, err := recordGitMetadata(store, projectID, rootPath, "", now)
	if err != nil {
		return ScanResult{}, err
	}
	evidenceCount += gitEvidence
	gitNotes := []string{}
	if gitNote != "" {
		gitNotes = append(gitNotes, gitNote)
	}
	repos, err := store.ListProjectRepos(projectID)
	if err != nil {
		return ScanResult{}, err
	}
	for _, repo := range repos {
		repoPath := ExpandRootPath(repo.Path)
		if repoPath == "" || samePath(repoPath, rootPath) {
			continue
		}
		_, extraEvidence, note, err := recordGitMetadata(store, projectID, repoPath, repo.Name, now)
		if err != nil {
			return ScanResult{}, err
		}
		evidenceCount += extraEvidence
		if note != "" {
			gitNotes = append(gitNotes, note)
		}
	}

	existingSources, err := store.ListKnowledge(projectID, knowledge.KindDoc)
	if err != nil {
		return ScanResult{}, err
	}
	sourceByPath := map[string]knowledge.Item{}
	for _, item := range existingSources {
		if path := knowledgeSourcePath(item.ExtraJSON); path != "" {
			sourceByPath[path] = item
		}
	}

	for _, file := range discovered.Files {
		if file.Skipped {
			continue
		}
		evidence, facts, err := importer.Materialize(projectID, file, now)
		if err != nil {
			skipped++
			continue
		}
		if existing, err := store.GetCanonEvidence(evidence.ID); err == nil {
			evidence.CreatedAt = existing.CreatedAt
		}
		if err := store.UpsertCanonEvidence(evidence); err != nil {
			return ScanResult{}, err
		}
		evidenceCount++
		for _, fact := range facts {
			if existing, err := store.GetCanonFact(fact.ID); err == nil {
				fact.CreatedAt = existing.CreatedAt
			}
			if err := store.UpsertCanonFact(fact); err != nil {
				return ScanResult{}, err
			}
			if err := store.LinkCanonEvidenceToFact(projectID, fact.ID, evidence.ID); err != nil {
				return ScanResult{}, err
			}
			if headID != "" {
				if err := store.LinkCanonEvidenceToFact(projectID, fact.ID, headID); err != nil {
					return ScanResult{}, err
				}
			}
			factCount++
		}
		if err := upsertImportedKnowledgeSource(store, projectID, file, sourceByPath, now); err != nil {
			return ScanResult{}, err
		}
		sourceCount++
		importedFiles++
	}

	message := "No matching MVP sources found under project root."
	if importedFiles > 0 {
		message = fmt.Sprintf("Imported %d facts from %d files.", factCount, importedFiles)
	}
	if len(gitNotes) > 0 {
		message += " " + strings.Join(gitNotes, " ")
	}
	return ScanResult{
		FactCount:     factCount,
		EvidenceCount: evidenceCount,
		SourceCount:   sourceCount,
		SkippedCount:  skipped,
		Message:       message,
	}, nil
}

func upsertImportedKnowledgeSource(store *storepkg.Store, projectID string, file importer.FileResult, sourceByPath map[string]knowledge.Item, now time.Time) error {
	path := filepath.ToSlash(file.Path)
	title := file.Title
	if title == "" {
		title = filepath.Base(path)
	}
	extra, _ := json.Marshal(map[string]string{"path": path})
	if existing, ok := sourceByPath[path]; ok {
		existing.Title = title
		existing.ExtraJSON = string(extra)
		existing.UpdatedAt = now
		if existing.Summary == "" {
			existing.Summary = file.Evidence.Summary
		}
		return store.SaveKnowledge(existing)
	}
	item, err := knowledge.NewItem(importer.StableSourceID(projectID, path), projectID, title, "", knowledge.DocTypeSource, nil)
	if err != nil {
		return err
	}
	item.Summary = file.Evidence.Summary
	item.ExtraJSON = string(extra)
	item.CreatedAt = now
	item.UpdatedAt = now
	sourceByPath[path] = item
	return store.SaveKnowledge(item)
}

func knowledgeSourcePath(extraJSON string) string {
	if extraJSON == "" {
		return ""
	}
	var payload struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal([]byte(extraJSON), &payload); err != nil {
		return ""
	}
	return filepath.ToSlash(payload.Path)
}
