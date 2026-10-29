package structure

import (
	"testing"
	"time"
)

func historyOps() []HistoryOp {
	t0 := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	return []HistoryOp{
		{Seq: 1, BatchID: "b1", Kind: "create", EntityID: "n1", CreatedAt: t0, Fields: map[string]any{
			"path": "core", "slug": "core", "title": "Core", "level": "domain", "status": "active", "position": float64(0),
			"decisions": []any{"Decision-0001"},
		}},
		{Seq: 2, BatchID: "b1", Kind: "create", EntityID: "i1", NodeID: "n1", CreatedAt: t0, Fields: map[string]any{
			"text": "No network", "state": "active", "position": float64(0),
		}},
		{Seq: 3, BatchID: "b2", Kind: "create", EntityID: "n2", CreatedAt: t0.Add(24 * time.Hour), Fields: map[string]any{
			"path": "core/import", "slug": "import", "title": "Import", "level": "component", "status": "active",
			"parent_id": "n1", "position": float64(1),
		}},
		{Seq: 4, BatchID: "b3", Kind: "update", EntityID: "n1", CreatedAt: t0.Add(48 * time.Hour), Fields: map[string]any{
			"migration_from": "REST", "migration_to": "Connect",
		}},
		{Seq: 5, BatchID: "b3", Kind: "update", EntityID: "i1", NodeID: "n1", CreatedAt: t0.Add(48 * time.Hour), Fields: map[string]any{
			"state": "removed",
		}},
		{Seq: 6, BatchID: "b4", Kind: "remove", EntityID: "n2", CreatedAt: t0.Add(72 * time.Hour), Fields: map[string]any{
			"status": "removed",
		}},
	}
}

func TestReplayAtBatch(t *testing.T) {
	ops := historyOps()
	cut, err := Cut(ops, "b2")
	if err != nil || cut != 3 {
		t.Fatalf("Cut(b2) = %d, %v; want 3", cut, err)
	}
	nodes := Replay("p", ops[:cut])
	if len(nodes) != 2 || nodes[0].Path != "core" || nodes[1].Path != "core/import" {
		t.Fatalf("nodes = %+v", nodes)
	}
	if nodes[0].Migrating() {
		t.Fatalf("core migrates before b3")
	}
	if len(nodes[0].Invariants) != 1 || nodes[0].Invariants[0].State != "active" {
		t.Fatalf("invariants = %+v", nodes[0].Invariants)
	}
	if got := nodes[0].Decisions; len(got) != 1 || got[0] != "Decision-0001" {
		t.Fatalf("decisions = %v", got)
	}
}

func TestReplayLatestMatchesFinalState(t *testing.T) {
	ops := historyOps()
	nodes := Replay("p", ops)
	rows := Historical(nodes)
	if len(rows) != 1 || rows[0].Path != "core" {
		t.Fatalf("rows = %+v (removed node must be left out)", rows)
	}
	if rows[0].MigrationFrom != "REST" || rows[0].MigrationTo != "Connect" {
		t.Fatalf("migration = %q -> %q", rows[0].MigrationFrom, rows[0].MigrationTo)
	}
	if rows[0].Invariants[0].State != "removed" || rows[0].Derived != "" {
		t.Fatalf("row = %+v", rows[0])
	}
}

func TestCutByDay(t *testing.T) {
	ops := historyOps()
	cut, err := Cut(ops, "2026-09-02")
	if err != nil || cut != 3 {
		t.Fatalf("Cut(day) = %d, %v; want 3", cut, err)
	}
	if _, err := Cut(ops, "yesterday"); err == nil {
		t.Fatal("expected an error for an unknown point")
	}
}

func TestHistoryGroupsBatches(t *testing.T) {
	entries := History(historyOps())
	if len(entries) != 4 || entries[0].NodeOps != 2 || entries[0].Summary != "core" {
		t.Fatalf("entries = %+v", entries)
	}
}
