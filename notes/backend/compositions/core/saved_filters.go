package core

import (
	"connectrpc.com/connect"
	"context"
	"github.com/polterware/polterware/notes/backend/domains/savedfilter"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

type savedFilterHandler struct{ s savedfilter.Service }

func (h savedFilterHandler) List(ctx context.Context, r *connect.Request[v1.ListSavedFiltersRequest]) (*connect.Response[v1.ListSavedFiltersResponse], error) {
	if h.s == nil {
		return nil, unavailable("saved filters")
	}
	items, err := h.s.List(ctx, r.Msg.Surface)
	out := &v1.ListSavedFiltersResponse{}
	for _, f := range items {
		out.Filters = append(out.Filters, savedFilterProto(f))
	}
	return response(out, err)
}
func (h savedFilterHandler) Save(ctx context.Context, r *connect.Request[v1.SaveSavedFilterRequest]) (*connect.Response[v1.SaveSavedFilterResponse], error) {
	if h.s == nil {
		return nil, unavailable("saved filters")
	}
	f, err := h.s.Save(ctx, r.Msg.Surface, r.Msg.Name, r.Msg.PayloadJson)
	return response(&v1.SaveSavedFilterResponse{Filter: savedFilterProto(f)}, err)
}
func (h savedFilterHandler) Delete(ctx context.Context, r *connect.Request[v1.DeleteSavedFilterRequest]) (*connect.Response[v1.DeleteSavedFilterResponse], error) {
	if h.s == nil {
		return nil, unavailable("saved filters")
	}
	return response(&v1.DeleteSavedFilterResponse{}, h.s.Delete(ctx, r.Msg.Id))
}
func savedFilterProto(f savedfilter.SavedFilter) *v1.SavedFilter {
	return &v1.SavedFilter{Id: f.ID, Surface: f.Surface, Name: f.Name, PayloadJson: f.PayloadJSON, Position: int32(f.Position), CreatedAt: stamp(f.CreatedAt), UpdatedAt: stamp(f.UpdatedAt)}
}
