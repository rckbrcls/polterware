package main

import (
	"context"
	"strings"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/platform/coreclient"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

func ensureClients(ctx context.Context, dbPath string) (coreclient.Clients, error) {
	state, err := coreclient.Ensure(ctx, dbPath)
	if err != nil {
		return coreclient.Clients{}, err
	}
	return coreclient.New(state, "cli")
}

func lookupSpaceID(ctx context.Context, clients coreclient.Clients, ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", nil
	}
	got, err := clients.Space.Get(ctx, connect.NewRequest(&v1.GetSpaceRequest{Id: ref}))
	if err == nil {
		return got.Msg.Space.Id, nil
	}
	if connect.CodeOf(err) != connect.CodeNotFound {
		return "", mapRPC(err)
	}
	page, err := clients.Space.List(ctx, connect.NewRequest(&v1.ListSpacesRequest{}))
	if err != nil {
		return "", mapRPC(err)
	}
	var matches []string
	valid := make([]string, 0, len(page.Msg.Spaces))
	for _, m := range page.Msg.Spaces {
		valid = append(valid, m.Name)
		if strings.EqualFold(m.Name, ref) {
			matches = append(matches, m.Id)
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		return "", exitf(ExitError, "space %q is ambiguous", ref)
	}
	return "", exitf(ExitNotFound, "Space %q not found. Valid: %s", ref, strings.Join(valid, ", "))
}

func lookupTagID(ctx context.Context, clients coreclient.Clients, ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", usagef("empty tag")
	}
	page, err := clients.Tag.List(ctx, connect.NewRequest(&v1.ListTagsRequest{}))
	if err != nil {
		return "", mapRPC(err)
	}
	valid := make([]string, 0, len(page.Msg.Tags))
	for _, t := range page.Msg.Tags {
		valid = append(valid, t.Name)
		if t.Id == ref || strings.EqualFold(t.Name, ref) {
			return t.Id, nil
		}
	}
	return "", exitf(ExitNotFound, "Tag %q not found. Valid: %s", ref, strings.Join(valid, ", "))
}

func getNote(ctx context.Context, clients coreclient.Clients, id string, include *v1.NoteInclude) (*v1.Note, error) {
	got, err := clients.Note.Get(ctx, connect.NewRequest(&v1.GetNoteRequest{Id: id, Include: include}))
	if err != nil {
		return nil, mapRPC(err)
	}
	return got.Msg.Note, nil
}

func getSpace(ctx context.Context, clients coreclient.Clients, ref string) (*v1.Space, error) {
	id, err := lookupSpaceID(ctx, clients, ref)
	if err != nil {
		return nil, err
	}
	got, err := clients.Space.Get(ctx, connect.NewRequest(&v1.GetSpaceRequest{Id: id}))
	if err != nil {
		return nil, mapRPC(err)
	}
	return got.Msg.Space, nil
}

func int64ptr(n int64) *int64 { return &n }

func int32ptr(n int32) *int32 { return &n }
