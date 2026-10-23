//go:build linux

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProcFileReread(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "stat")
	if err := os.WriteFile(path, []byte("cpu 1 0 0 1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	f, err := openProc(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	first, err := f.Read()
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != "cpu 1 0 0 1\n" {
		t.Fatalf("first %q", first)
	}
	if err := os.WriteFile(path, []byte("cpu 9 0 0 9\ncpu0 4 0 0 4\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	second, err := f.Read()
	if err != nil {
		t.Fatal(err)
	}
	if string(second) != "cpu 9 0 0 9\ncpu0 4 0 0 4\n" {
		t.Fatalf("second %q", second)
	}
	third, err := f.Read()
	if err != nil || string(third) != string(second) {
		t.Fatalf("third %q %v", third, err)
	}
}
