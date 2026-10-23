package main

import (
	"bytes"
	"testing"
)

// protojson injects random whitespace that depends on the binary; --json must not.
func TestWriteJSONBytesIsByteStable(t *testing.T) {
	var out bytes.Buffer
	if err := writeJSONBytes(&out, []byte(`{"a": 1,  "b":[1, 2],"c": {"d":  "x y"}}`)); err != nil {
		t.Fatal(err)
	}
	if got, want := out.String(), "{\"a\":1,\"b\":[1,2],\"c\":{\"d\":\"x y\"}}\n"; got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if err := writeJSONBytes(&out, []byte(`{broken`)); err == nil {
		t.Fatal("invalid JSON must be an error, not printed")
	}
}
