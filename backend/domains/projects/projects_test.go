package projects

import "testing"

func TestNewProjectNeedsNoFolder(t *testing.T) {
	if _, err := NewProject("project", "Project"); err != nil {
		t.Fatal(err)
	}
	if _, err := NewProject("project", ""); err == nil {
		t.Fatal("a project needs a name")
	}
}
