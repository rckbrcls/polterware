package core

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/clock"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
)

type placeService struct {
	repo  place.Repository
	notes note.Repository
	clock clock.Clock
	audit activity.Audit
}

func (s placeService) Set(ctx context.Context, p place.Place, expectedRev int64) (place.Place, error) {
	if p.NoteID == "" {
		return place.Place{}, invalid("place.note_id", "required")
	}
	if p.Lat < -90 || p.Lat > 90 || p.Lng < -180 || p.Lng > 180 {
		return place.Place{}, invalid("place", "coordinates must be valid WGS84")
	}
	if p.RadiusM == 0 {
		p.RadiusM = place.DefaultRadiusM
	}
	if p.RadiusM < place.MinRadiusM || p.RadiusM > place.MaxRadiusM {
		return place.Place{}, invalid("place.radius_m", "must be between 25 and 5000")
	}
	if p.Event == "" {
		p.Event = place.EventEnter
	}
	if p.Event != place.EventEnter && p.Event != place.EventExit {
		return place.Place{}, invalid("place.event", "must be enter or exit")
	}
	p.UpdatedAt = s.clock.Now().UTC()
	err := s.audit.Write(ctx, caller(ctx), "place", p.NoteID, activity.OpUpdate, "Set place", func(ctx context.Context) error {
		if err := bumpNoteRevisionExpecting(ctx, s.notes, p.NoteID, expectedRev, p.UpdatedAt); err != nil {
			return err
		}
		return s.repo.Upsert(ctx, p)
	})
	if err != nil {
		return place.Place{}, err
	}
	return p, nil
}

func (s placeService) Clear(ctx context.Context, noteID string, expectedRev int64) error {
	if noteID == "" {
		return invalid("note_id", "required")
	}
	err := s.audit.Write(ctx, caller(ctx), "place", noteID, activity.OpDelete, "Clear place", func(ctx context.Context) error {
		if err := s.repo.Delete(ctx, noteID); err != nil {
			return err
		}
		return bumpNoteRevisionExpecting(ctx, s.notes, noteID, expectedRev, s.clock.Now().UTC())
	})
	if err != nil && !fault.IsCode(err, fault.CodeNotFound) {
		return err
	}
	return err
}

func (s placeService) ListInBounds(ctx context.Context, b place.Bounds) ([]place.Place, error) {
	if b.South > b.North {
		return nil, invalid("bounds", "south must be at most north")
	}
	return s.repo.ListInBounds(ctx, b)
}
