package sqlite

import (
	"context"
	"fmt"
	"math/rand"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
)

func TestForeignKeyCheckAfterRandomOps(t *testing.T) {
	s := openStore(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 3, 21, 30, 0, 0, time.UTC)
	rng := rand.New(rand.NewSource(4))
	var spaces []string
	var notes []string
	var tags []string
	for i := 0; i < 200; i++ {
		switch rng.Intn(8) {
		case 0:
			id := fmt.Sprintf("space%03d", i)
			var parent *string
			if len(spaces) > 0 && rng.Intn(2) == 0 {
				parent = &spaces[rng.Intn(len(spaces))]
			}
			if err := s.Spaces().Insert(ctx, space.Space{ID: id, ParentID: parent, Name: id, CreatedAt: now, UpdatedAt: now, Rev: 1}); err == nil {
				spaces = append(spaces, id)
			}
		case 1:
			if len(spaces) == 0 {
				continue
			}
			id := spaces[rng.Intn(len(spaces))]
			_ = s.Spaces().Delete(ctx, 0, id)
			next := spaces[:0]
			for _, m := range spaces {
				if _, err := s.Spaces().Get(ctx, m); err == nil {
					next = append(next, m)
				}
			}
			spaces = next
		case 2:
			id := fmt.Sprintf("mem%03d", i)
			var spaceID *string
			if len(spaces) > 0 && rng.Intn(3) != 0 {
				spaceID = &spaces[rng.Intn(len(spaces))]
			}
			if err := s.Notes().Insert(ctx, note.Note{ID: id, SpaceID: spaceID, Title: id, Status: note.StatusActive, CreatedAt: now, UpdatedAt: now, Rev: 1}); err == nil {
				notes = append(notes, id)
			}
		case 3:
			if len(notes) == 0 {
				continue
			}
			id := notes[rng.Intn(len(notes))]
			_ = s.Notes().Delete(ctx, 0, id)
			next := notes[:0]
			for _, m := range notes {
				if _, err := s.Notes().Get(ctx, m); err == nil {
					next = append(next, m)
				}
			}
			notes = next
		case 4:
			id := fmt.Sprintf("tag%03d", i)
			if err := s.Tags().Insert(ctx, tag.Tag{ID: id, Name: id, CreatedAt: now, UpdatedAt: now, Rev: 1}); err == nil {
				tags = append(tags, id)
			}
		case 5:
			if len(tags) == 0 {
				continue
			}
			id := tags[rng.Intn(len(tags))]
			_ = s.Tags().Delete(ctx, id)
			next := tags[:0]
			for _, x := range tags {
				if _, err := s.Tags().Get(ctx, x); err == nil {
					next = append(next, x)
				}
			}
			tags = next
		case 6:
			if len(notes) == 0 || len(tags) == 0 {
				continue
			}
			_ = s.Notes().SetTagIDs(ctx, notes[rng.Intn(len(notes))], []string{tags[rng.Intn(len(tags))]})
		default:
			if len(notes) == 0 {
				continue
			}
			id := notes[rng.Intn(len(notes))]
			_ = s.Notes().ReplaceCheckItems(ctx, id, []note.CheckItem{{
				ID: fmt.Sprintf("chk%03d", i), NoteID: id, Title: "item", CreatedAt: now, UpdatedAt: now,
			}})
		}
	}
	rows, err := s.Handle().Writer().QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var violations int
	for rows.Next() {
		violations++
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if violations != 0 {
		t.Fatalf("foreign_key_check rows=%d", violations)
	}
}
