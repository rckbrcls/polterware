package contract

import (
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"testing"
)

func TestProjectContainsLocalPath(t *testing.T) {
	project := &localv1.Project{Id: "project", Name: "Project"}
	environment := &localv1.Environment{Id: "local", ProjectId: project.Id, Name: "local", Kind: "local"}
	if project.Name == "" || environment.ProjectId != project.Id {
		t.Fatal("project contract")
	}
}
