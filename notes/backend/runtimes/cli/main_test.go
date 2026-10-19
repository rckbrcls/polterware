package main

import "testing"

func TestVersionConstant(t *testing.T) {
	if version != "0.0.0-dev" {
		t.Fatalf("unexpected version: %s", version)
	}
}
