package mcp

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
)

func resolveSpace(ctx context.Context, spaces space.Service, ref string) (space.Space, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return space.Space{}, fault.Invalid(fault.Violation{Field: "space", Reason: "required"})
	}
	if got, err := spaces.Get(ctx, ref); err == nil {
		return got, nil
	} else if !fault.IsCode(err, fault.CodeNotFound) {
		return space.Space{}, err
	}
	rows, err := spaces.List(ctx)
	if err != nil {
		return space.Space{}, err
	}
	names := make(map[string]string, len(rows))
	valid := make([]string, 0, len(rows))
	for _, row := range rows {
		names[row.ID] = row.Name
		valid = append(valid, row.Name)
	}
	id, err := activity.Lookup(ref, names)
	if err != nil {
		sort.Strings(valid)
		return space.Space{}, &fault.Error{Code: fault.CodeNotFound, Entity: "space", Message: fmt.Sprintf("Space %q not found. Valid: %s", ref, strings.Join(valid, ", "))}
	}
	return spaces.Get(ctx, id)
}

func resolveTag(ctx context.Context, tags tag.Service, ref string) (tag.Tag, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return tag.Tag{}, fault.Invalid(fault.Violation{Field: "tag", Reason: "required"})
	}
	rows, err := tags.List(ctx)
	if err != nil {
		return tag.Tag{}, err
	}
	names := make(map[string]string, len(rows))
	valid := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.ID == ref {
			return row, nil
		}
		names[row.ID] = row.Name
		valid = append(valid, row.Name)
	}
	id, err := activity.Lookup(ref, names)
	if err != nil {
		sort.Strings(valid)
		return tag.Tag{}, &fault.Error{Code: fault.CodeNotFound, Entity: "tag", Message: fmt.Sprintf("Tag %q not found. Valid: %s", ref, strings.Join(valid, ", "))}
	}
	for _, row := range rows {
		if row.ID == id {
			return row, nil
		}
	}
	return tag.Tag{}, fault.NotFound("tag", ref)
}

func resolveTags(ctx context.Context, tags tag.Service, refs []string) ([]string, error) {
	ids := make([]string, 0, len(refs))
	for _, ref := range refs {
		got, err := resolveTag(ctx, tags, ref)
		if err != nil {
			return nil, err
		}
		ids = append(ids, got.ID)
	}
	return ids, nil
}

func optionalSpace(ctx context.Context, spaces space.Service, ref string) (*string, error) {
	if strings.TrimSpace(ref) == "" {
		return nil, nil
	}
	got, err := resolveSpace(ctx, spaces, ref)
	if err != nil {
		return nil, err
	}
	id := got.ID
	return &id, nil
}
