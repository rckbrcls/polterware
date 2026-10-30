package wedge

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/providers/importer"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ScanResult is the deterministic import summary (B2).
type ScanResult struct {
	FactCount     int32  `json:"fact_count"`
	EvidenceCount int32  `json:"evidence_count"`
	SkippedCount  int32  `json:"skipped_count"`
	Message       string `json:"message"`
}

// ScanProject discovers the MVP files under the project root and upserts their evidence and facts.
// Repository files are not registered as docs: agents read them from the checkout.
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
	var factCount, evidenceCount int32
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
		SkippedCount:  skipped,
		Message:       message,
	}, nil
}
