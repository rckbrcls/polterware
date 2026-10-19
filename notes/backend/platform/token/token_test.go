package token

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMintStableAndRotate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mcp-token")
	first, err := LoadOrMint(path)
	if err != nil {
		t.Fatal(err)
	}
	again, err := LoadOrMint(path)
	if err != nil || first != again {
		t.Fatalf("unstable token: %v", err)
	}
	rotated, err := Rotate(path)
	if err != nil || rotated == first {
		t.Fatalf("rotate: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("token permissions: %v", err)
	}
	if !Equal(first, first) || Equal(first, rotated) || Equal("", "") || Equal(first, first+"x") {
		t.Fatal("bearer comparison")
	}
	if err := os.WriteFile(path, []byte("bad token"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrMint(path); err == nil {
		t.Fatal("silently replaced corrupt token")
	}
}
