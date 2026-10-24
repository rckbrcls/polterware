package main

import (
	"flag"
	"strings"
	"testing"
)

func TestScopeFlagRepeatAndComma(t *testing.T) {
	fs := flag.NewFlagSet("t", flag.ContinueOnError)
	scope := addScopeFlags(fs)
	if err := fs.Parse([]string{"--scope", "auth, billing", "--scope", "login", "--exact"}); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(scope.nodes(), "|"); got != "auth|billing|login" || !*scope.exact {
		t.Fatalf("nodes=%s exact=%v", got, *scope.exact)
	}
}
