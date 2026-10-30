package projects

import (
	"errors"
	"regexp"
	"time"
)

const (
	StatusActive   = "active"
	StatusArchived = "archived"
)

type Project struct {
	ID         string
	Name       string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Status     string
	ArchivedAt time.Time
}

type Environment struct {
	ID          string
	ProjectID   string
	Name        string
	Kind        string
	Protection  string
	IsDefault   bool
	Description string
}

type Settings struct {
	ProjectID            string
	Description          string
	DefaultEnvironmentID string
	Repository           string
	// AgentsSync keeps the generated AGENTS.md block of each checkout current.
	// It is set on its own (SetAgentsSync), never by a settings save.
	AgentsSync bool
}

// Repository is a Git repository Structure components link by name. Remote is
// its GitHub-level identity (github.com/owner/repo, empty when it has none);
// LocalPath is this machine's clone, empty when it is not cloned here.
type Repository struct {
	ID        string
	ProjectID string
	Name      string
	Remote    string
	LocalPath string
	CreatedAt time.Time
	UpdatedAt time.Time
}

var repoNamePattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidRepoName reports whether name is a short lowercase handle.
func ValidRepoName(name string) bool {
	return len(name) <= 40 && repoNamePattern.MatchString(name)
}

var ErrInvalid = errors.New("invalid project entity")

func NewProject(id, name string) (Project, error) {
	if id == "" || name == "" {
		return Project{}, ErrInvalid
	}
	now := time.Now().UTC()
	return Project{
		ID:        id,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
		Status:    StatusActive,
	}, nil
}

func NewRepository(id, projectID, name, remote, localPath string) (Repository, error) {
	if id == "" || projectID == "" || (remote == "" && localPath == "") || !ValidRepoName(name) {
		return Repository{}, ErrInvalid
	}
	now := time.Now().UTC()
	return Repository{
		ID:        id,
		ProjectID: projectID,
		Name:      name,
		Remote:    remote,
		LocalPath: localPath,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func NewEnvironment(id, projectID, name, kind string) (Environment, error) {
	if id == "" || projectID == "" || name == "" {
		return Environment{}, ErrInvalid
	}
	if kind == "" {
		kind = "local"
	}
	return Environment{ID: id, ProjectID: projectID, Name: name, Kind: kind, Protection: "standard"}, nil
}
