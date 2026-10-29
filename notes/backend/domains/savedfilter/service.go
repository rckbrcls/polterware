package savedfilter

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/clock"
	"github.com/polterware/polterware/notes/backend/domains/ids"
)

const (
	maxSurface = 60
	maxName    = 80
)

type service struct {
	repo  Repository
	clock clock.Clock
	ids   ids.Generator
}

func NewService(r Repository, c clock.Clock, g ids.Generator) Service { return &service{r, c, g} }

func (s *service) List(ctx context.Context, surface string) ([]SavedFilter, error) {
	surface = strings.TrimSpace(surface)
	if e := activity.ValidateName("surface", surface, maxSurface); e != nil {
		return nil, e
	}
	return s.repo.List(ctx, surface)
}

func (s *service) Save(ctx context.Context, surface, name, payloadJSON string) (SavedFilter, error) {
	surface, name = strings.TrimSpace(surface), strings.TrimSpace(name)
	if e := activity.ValidateName("surface", surface, maxSurface); e != nil {
		return SavedFilter{}, e
	}
	if e := activity.ValidateName("name", name, maxName); e != nil {
		return SavedFilter{}, e
	}
	if e := ValidatePayload(payloadJSON); e != nil {
		return SavedFilter{}, e
	}
	now := s.clock.Now().UTC()
	return s.repo.Save(ctx, SavedFilter{ID: s.ids.New(), Surface: surface, Name: name, PayloadJSON: payloadJSON, CreatedAt: now, UpdatedAt: now})
}

func (s *service) Delete(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return activity.Invalid("id", "required")
	}
	return s.repo.Delete(ctx, id)
}

// ValidatePayload accepts a JSON object whose "version" is an integer; everything else is opaque.
func ValidatePayload(raw string) error {
	var doc map[string]json.RawMessage
	if !json.Valid([]byte(raw)) || json.Unmarshal([]byte(raw), &doc) != nil || doc == nil {
		return activity.Invalid("payload_json", "must be a JSON object")
	}
	if _, err := strconv.ParseInt(string(doc["version"]), 10, 64); err != nil {
		return activity.Invalid("payload_json", "version must be an integer")
	}
	return nil
}
