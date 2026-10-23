package tag_test

import (
	"github.com/polterware/polterware/notes/backend/domains/activity/fake/testkit"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"testing"
)

func setup() *testkit.Fixture { return testkit.Setup() }
func check(t *testing.T, e error) {
	t.Helper()
	if e != nil {
		t.Fatal(e)
	}
}
func code(t *testing.T, e error, want string) {
	t.Helper()
	if !fault.IsCode(e, want) {
		t.Fatalf("got %v, want %s", e, want)
	}
}
func ptr[T any](v T) *T { return &v }
