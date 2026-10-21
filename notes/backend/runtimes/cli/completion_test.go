package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestCompletionGoldens(t *testing.T) {
	for _, shell := range []string{"zsh", "bash", "fish"} {
		var out bytes.Buffer
		if err := runCompletion([]string{shell}, &out, ioDiscard()); err != nil {
			t.Fatal(err)
		}
		assertGolden(t, filepath.Join("completion", shell+".txt"), out.String())
	}
	if err := runCompletion([]string{"powershell"}, ioDiscard(), ioDiscard()); err == nil {
		t.Fatal("expected usage error")
	} else if exitCodeOf(err) != ExitUsage {
		t.Fatalf("exit %d", exitCodeOf(err))
	}
}

func TestMCPSnippetGoldensMatchSettingsTS(t *testing.T) {
	cases := []struct {
		name string
		in   mcpSnippetInput
	}{
		{name: "runtime-defaults", in: mcpSnippetInput{Port: 47600, Token: "secret-token"}},
		{name: "packaged-binary", in: mcpSnippetInput{Port: 47600, Token: "<mcp-token>", Command: "/Applications/Polterware Notes.app/Contents/Resources/pwnotes"}},
		{name: "custom-port", in: mcpSnippetInput{Port: 48001, Token: "abc"}},
		{name: "empty-token", in: mcpSnippetInput{Port: 47600, Token: ""}},
	}
	for _, tc := range cases {
		s := buildMCPSnippets(tc.in)
		assertGolden(t, filepath.Join("mcp", tc.name+".claude-stdio.txt"), s.ClaudeStdio+"\n")
		assertGolden(t, filepath.Join("mcp", tc.name+".claude-http.txt"), s.ClaudeHTTP+"\n")
		assertGolden(t, filepath.Join("mcp", tc.name+".cursor-stdio.json"), s.CursorStdioJSON+"\n")
		assertGolden(t, filepath.Join("mcp", tc.name+".cursor-http.json"), s.CursorHTTPJSON+"\n")
		assertGolden(t, filepath.Join("mcp", tc.name+".cursor-config.json"), s.CursorConfig+"\n")
		assertGolden(t, filepath.Join("mcp", tc.name+".claude-desktop-stdio.json"), s.ClaudeDesktopStdio+"\n")
		assertGolden(t, filepath.Join("mcp", tc.name+".claude-desktop-http.json"), s.ClaudeDesktopHTTP+"\n")
	}
}

func assertGolden(t *testing.T, name, got string) {
	t.Helper()
	path := filepath.Join("testdata", name)
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden %s (set UPDATE_GOLDEN=1 to write): %v", path, err)
	}
	if string(want) != got {
		t.Fatalf("%s\nwant:\n%s\ngot:\n%s", name, want, got)
	}
}
