package coreclient

import (
	"github.com/polterware/polterware/notes/backend/platform/runstate"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type neverHTTP struct{ t *testing.T }

func (n neverHTTP) Do(*http.Request) (*http.Response, error) {
	n.t.Fatal("must not send token to invalid endpoint")
	return nil, nil
}
func TestRejectUnsafeEndpointBeforeSendingBearer(t *testing.T) {
	for _, endpoint := range []string{"http://example.com:1234", "http://localhost:1234", "http://127.0.0.1:0"} {
		if _, err := NewWithHTTP(runstate.Core{Endpoint: endpoint, Token: "private"}, "cli", neverHTTP{t}); err == nil {
			t.Fatal("unsafe endpoint")
		}
	}
}
func TestBuildHandshake(t *testing.T) {
	path := filepath.Join(t.TempDir(), "binary")
	if err := os.WriteFile(path, []byte("test"), 0o600); err != nil {
		t.Fatal(err)
	}
	at := time.Unix(123456, 0)
	if err := os.Chtimes(path, at, at); err != nil {
		t.Fatal(err)
	}
	if got := BuildID(path); got != "123456-4" {
		t.Fatal(got)
	}
	for _, tc := range []struct {
		a, b  string
		newer bool
	}{{"2-2", "1-1", true}, {"1-9", "1-1", false}, {"1-1", "2-2", false}, {"broken", "1-1", false}, {"2-1", "broken", false}} {
		if got := NewerBuild(tc.a, tc.b); got != tc.newer {
			t.Fatalf("newer(%s,%s)=%v", tc.a, tc.b, got)
		}
	}
}
