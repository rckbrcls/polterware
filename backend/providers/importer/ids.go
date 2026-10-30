package importer

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// StableFactID returns a deterministic fact id for re-import upserts.
func StableFactID(projectID, relPath, key string) string {
	return "fact-import-" + shortHash(projectID+"|"+relPath+"|"+key)
}

// StableEvidenceID returns a deterministic evidence id for a relative path.
func StableEvidenceID(projectID, relPath string) string {
	return "ev-import-" + shortHash(projectID+"|"+relPath)
}

// StableGitHeadEvidenceID is the single current-HEAD evidence row for a project.
// Rescans replace its SHA in place.
func StableGitHeadEvidenceID(projectID string) string {
	return "ev-git-head-" + shortHash(projectID)
}

// StableGitCommitEvidenceID is one commit evidence row. Rows are kept after
// they leave the recent-commit window.
func StableGitCommitEvidenceID(projectID, sha string) string {
	return "ev-git-" + shortHash(projectID+"|"+sha)
}

// StableGitRepoHeadEvidenceID is the current-HEAD row for one named checkout.
func StableGitRepoHeadEvidenceID(projectID, repoName string) string {
	return "ev-git-head-" + shortHash(projectID+"|"+repoName)
}

// StableGitRepoCommitEvidenceID is one commit row for a named checkout.
func StableGitRepoCommitEvidenceID(projectID, repoName, sha string) string {
	return "ev-git-" + shortHash(projectID+"|"+repoName+"|"+sha)
}

// ImportSource tags provenance as import:<relpath>.
func ImportSource(relPath string) string {
	return fmt.Sprintf("import:%s", relPath)
}

func shortHash(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])[:12]
}
