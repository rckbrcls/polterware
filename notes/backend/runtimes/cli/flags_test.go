package main

import (
	"flag"
	"testing"
)

func TestParseCommandInterspersed(t *testing.T) {
	newFS := func() *flag.FlagSet {
		fs := flag.NewFlagSet("add", flag.ContinueOnError)
		fs.String("due", "", "")
		fs.String("repeat", "", "")
		fs.String("space", "", "")
		fs.Bool("yes", false, "")
		fs.Bool("json", false, "")
		return fs
	}
	fs := newFS()
	pos, err := parseCommand(fs, []string{"Standup", "--due", "2099-01-01T09:00:00Z", "--repeat", "daily"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pos) != 1 || pos[0] != "Standup" || fs.Lookup("due").Value.String() != "2099-01-01T09:00:00Z" || fs.Lookup("repeat").Value.String() != "daily" {
		t.Fatalf("pos=%v due=%s repeat=%s", pos, fs.Lookup("due").Value, fs.Lookup("repeat").Value)
	}
	fs = newFS()
	pos, err = parseCommand(fs, []string{"id", "--yes"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pos) != 1 || pos[0] != "id" || fs.Lookup("yes").Value.String() != "true" {
		t.Fatalf("rm: pos=%v yes=%s", pos, fs.Lookup("yes").Value)
	}
	fs = newFS()
	pos, err = parseCommand(fs, []string{"Buy milk", "--repeat", "every", "2", "days"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pos) != 1 || pos[0] != "Buy milk" || fs.Lookup("repeat").Value.String() != "every 2 days" {
		t.Fatalf("every N: pos=%v repeat=%s", pos, fs.Lookup("repeat").Value)
	}
	fs = newFS()
	pos, err = parseCommand(fs, []string{"claude", "--json"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pos) != 1 || pos[0] != "claude" || fs.Lookup("json").Value.String() != "true" {
		t.Fatalf("mcp json: pos=%v json=%s", pos, fs.Lookup("json").Value)
	}
}
