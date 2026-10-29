package main

import (
	"strings"
	"testing"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

func TestCanvasUsage(t *testing.T) {
	if err := runCanvas("", nil); err == nil || !strings.Contains(err.Error(), "canvas ls") {
		t.Fatalf("empty: %v", err)
	}
	if err := runCanvas("", []string{"nope"}); err == nil || !strings.Contains(err.Error(), "canvas show") {
		t.Fatalf("unknown: %v", err)
	}
	if err := runCanvas("", []string{"ls", "--all"}); err == nil {
		t.Fatal("expected --all to be rejected")
	}
}

func TestParseCanvasList(t *testing.T) {
	got, err := parseCanvasList([]string{"--agents", "--scope", "auth, billing", "--scope", "login", "--exact", "--project", "p1"})
	if err != nil {
		t.Fatal(err)
	}
	if !got.agents || !got.exact || got.project != "p1" || strings.Join(got.scope, "|") != "auth|billing|login" {
		t.Fatalf("list = %+v", got)
	}
	if _, err := parseCanvasList([]string{"extra"}); err == nil {
		t.Fatal("expected extra arg to fail")
	}
	plain, err := parseCanvasList(nil)
	if err != nil || plain.agents || plain.exact || len(plain.scope) != 0 {
		t.Fatalf("plain = %+v err=%v", plain, err)
	}
}

func TestParseCanvasShow(t *testing.T) {
	got, err := parseCanvasShow([]string{"Platform map", "--format", "dot", "--project", "p1"})
	if err != nil {
		t.Fatal(err)
	}
	if got.ref != "Platform map" || got.format != "dot" || got.project != "p1" {
		t.Fatalf("show = %+v", got)
	}
	got, err = parseCanvasShow([]string{"--format", "Mermaid", "id-1"})
	if err != nil || got.format != "mermaid" || got.ref != "id-1" {
		t.Fatalf("show = %+v err=%v", got, err)
	}
	def, err := parseCanvasShow([]string{"id-1"})
	if err != nil || def.format != "mermaid" {
		t.Fatalf("default = %+v err=%v", def, err)
	}
	if _, err := parseCanvasShow(nil); err == nil {
		t.Fatal("expected missing ref")
	}
	if _, err := parseCanvasShow([]string{"id-1", "--format", "yaml"}); err == nil {
		t.Fatal("expected unknown format")
	}
}

func TestParseCanvasShare(t *testing.T) {
	on, err := parseCanvasShare([]string{"Platform", "on", "--project", "p1"})
	if err != nil || !on.on || on.ref != "Platform" || on.project != "p1" {
		t.Fatalf("on = %+v err=%v", on, err)
	}
	off, err := parseCanvasShare([]string{"--project", "p1", "id-1", "off"})
	if err != nil || off.on || off.ref != "id-1" {
		t.Fatalf("off = %+v err=%v", off, err)
	}
	if _, err := parseCanvasShare([]string{"id-1", "maybe"}); err == nil {
		t.Fatal("expected on|off")
	}
	if _, err := parseCanvasShare([]string{"id-1"}); err == nil {
		t.Fatal("expected on|off")
	}
}

func TestFormatCanvasListShowsVisibleColumn(t *testing.T) {
	text := formatCanvasList([]*localv1.Canvas{
		{Id: "c1", Name: "Map", Type: "canvas", AgentVisible: true, ScopeNodeId: "n1"},
		{Id: "c2", Name: "Draft", Type: "canvas", AgentVisible: false},
	}, false)
	if !strings.Contains(text, "visible") || !strings.Contains(text, "c1") || !strings.Contains(text, "yes") || !strings.Contains(text, "no") || !strings.Contains(text, "n1") {
		t.Fatalf("list =\n%s", text)
	}
	only := selectCanvases([]*localv1.Canvas{
		{Id: "c1", AgentVisible: true},
		{Id: "c2", AgentVisible: false},
	}, true)
	if len(only) != 1 || only[0].GetId() != "c1" {
		t.Fatalf("agents filter = %+v", only)
	}
	if got := formatCanvasList(nil, true); got != "no agent-visible canvases\n" {
		t.Fatalf("empty agents = %q", got)
	}
}

func TestFindCanvasByIDOrName(t *testing.T) {
	items := []*localv1.Canvas{
		{Id: "id-1", Name: "Map"},
		{Id: "id-2", Name: "Map"},
		{Id: "id-3", Name: "Draft"},
	}
	got, err := findCanvas(items, "id-2")
	if err != nil || got.GetId() != "id-2" {
		t.Fatalf("id = %+v err=%v", got, err)
	}
	got, err = findCanvas(items, "Draft")
	if err != nil || got.GetId() != "id-3" {
		t.Fatalf("name = %+v err=%v", got, err)
	}
	if _, err := findCanvas(items, "Map"); err == nil || !strings.Contains(err.Error(), "matches 2") {
		t.Fatalf("ambiguous: %v", err)
	}
	if _, err := findCanvas(items, "missing"); err == nil || !strings.Contains(err.Error(), "unknown canvas") {
		t.Fatalf("missing: %v", err)
	}
}
