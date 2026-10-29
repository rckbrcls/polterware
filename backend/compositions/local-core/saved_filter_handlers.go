package localcore

import (
	"context"
	"errors"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/filters"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

// Saved filters are UI preferences: these handlers write the store directly,
// without an audited change envelope.

func (core *Core) ListSavedFilters(_ context.Context, request *connect.Request[localv1.ListSavedFiltersRequest]) (*connect.Response[localv1.ListSavedFiltersResponse], error) {
	surface := strings.TrimSpace(request.Msg.GetSurface())
	if err := filters.ValidateSurface(surface); err != nil {
		return nil, mapSavedFilterErr(err)
	}
	items, err := core.Store.ListSavedFilters(request.Msg.GetProjectId(), surface)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.SavedFilter, 0, len(items))
	for _, item := range items {
		out = append(out, savedFilterProto(item))
	}
	return connect.NewResponse(&localv1.ListSavedFiltersResponse{Filters: out}), nil
}

func (core *Core) SaveSavedFilter(_ context.Context, request *connect.Request[localv1.SaveSavedFilterRequest]) (*connect.Response[localv1.SaveSavedFilterResponse], error) {
	msg := request.Msg
	saved, err := core.Store.SaveSavedFilter(filters.SavedFilter{
		ProjectID: msg.GetProjectId(), Surface: msg.GetSurface(), Name: msg.GetName(), PayloadJSON: msg.GetPayloadJson(),
	})
	if err != nil {
		return nil, mapSavedFilterErr(err)
	}
	return connect.NewResponse(&localv1.SaveSavedFilterResponse{Filter: savedFilterProto(saved)}), nil
}

func (core *Core) DeleteSavedFilter(_ context.Context, request *connect.Request[localv1.DeleteSavedFilterRequest]) (*connect.Response[localv1.DeleteSavedFilterResponse], error) {
	id := strings.TrimSpace(request.Msg.GetId())
	if id == "" {
		return nil, invalid("saved filter id is required")
	}
	if err := core.Store.DeleteSavedFilter(id); err != nil {
		return nil, mapSavedFilterErr(err)
	}
	return connect.NewResponse(&localv1.DeleteSavedFilterResponse{}), nil
}

func mapSavedFilterErr(err error) error {
	switch {
	case errors.Is(err, filters.ErrSurfaceRequired),
		errors.Is(err, filters.ErrSurfaceLength),
		errors.Is(err, filters.ErrNameRequired),
		errors.Is(err, filters.ErrNameLength),
		errors.Is(err, filters.ErrPayload):
		return invalid(err.Error())
	case errors.Is(err, filters.ErrNotFound), errors.Is(err, filters.ErrProjectNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	default:
		return internal(err)
	}
}

func savedFilterProto(item filters.SavedFilter) *localv1.SavedFilter {
	return &localv1.SavedFilter{
		Id:          item.ID,
		ProjectId:   item.ProjectID,
		Surface:     item.Surface,
		Name:        item.Name,
		PayloadJson: item.PayloadJSON,
		Position:    int32(item.Position),
		CreatedAt:   item.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:   item.UpdatedAt.UTC().Format(time.RFC3339),
	}
}
