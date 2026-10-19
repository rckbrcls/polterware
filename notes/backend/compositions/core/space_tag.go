package core

import (
	"connectrpc.com/connect"
	"context"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

type spaceHandler struct{ s space.Service }

func (h spaceHandler) List(ctx context.Context, _ *connect.Request[v1.ListSpacesRequest]) (*connect.Response[v1.ListSpacesResponse], error) {
	if h.s == nil {
		return nil, unavailable("spaces")
	}
	items, err := h.s.List(ctx)
	out := &v1.ListSpacesResponse{}
	for _, m := range items {
		out.Spaces = append(out.Spaces, spaceProto(m))
	}
	return response(out, err)
}
func (h spaceHandler) Get(ctx context.Context, r *connect.Request[v1.GetSpaceRequest]) (*connect.Response[v1.GetSpaceResponse], error) {
	if h.s == nil {
		return nil, unavailable("spaces")
	}
	m, err := h.s.Get(ctx, r.Msg.Id)
	return response(&v1.GetSpaceResponse{Space: spaceProto(m)}, err)
}
func (h spaceHandler) Create(ctx context.Context, r *connect.Request[v1.CreateSpaceRequest]) (*connect.Response[v1.CreateSpaceResponse], error) {
	if h.s == nil {
		return nil, unavailable("spaces")
	}
	in := r.Msg
	m, err := h.s.Create(ctx, caller(ctx), space.Create{ParentID: stringPtr(in.ParentId), Name: in.Name, Color: stringPtr(in.Color), Icon: stringPtr(in.Icon), SortOrder: int(in.SortOrder)})
	return response(&v1.CreateSpaceResponse{Space: spaceProto(m)}, err)
}
func (h spaceHandler) Update(ctx context.Context, r *connect.Request[v1.UpdateSpaceRequest]) (*connect.Response[v1.UpdateSpaceResponse], error) {
	if h.s == nil {
		return nil, unavailable("spaces")
	}
	in := r.Msg
	m, err := h.s.Update(ctx, caller(ctx), in.Id, in.GetExpectedRev(), space.Patch{Name: in.Name, ParentID: in.ParentId, ClearParent: in.ClearParent, Color: in.Color, ClearColor: in.ClearColor, Icon: in.Icon, ClearIcon: in.ClearIcon, SortOrder: intPtr(in.SortOrder)})
	return response(&v1.UpdateSpaceResponse{Space: spaceProto(m)}, err)
}
func (h spaceHandler) Delete(ctx context.Context, r *connect.Request[v1.DeleteSpaceRequest]) (*connect.Response[v1.DeleteSpaceResponse], error) {
	if h.s == nil {
		return nil, unavailable("spaces")
	}
	d, err := h.s.Delete(ctx, caller(ctx), r.Msg.Id, r.Msg.GetExpectedRev())
	return response(&v1.DeleteSpaceResponse{DeletedSpaceIds: d.DeletedSpaceIDs, MovedNoteCount: int32(d.MovedNoteCount)}, err)
}
func (h spaceHandler) Reorder(ctx context.Context, r *connect.Request[v1.ReorderSpacesRequest]) (*connect.Response[v1.ReorderSpacesResponse], error) {
	if h.s == nil {
		return nil, unavailable("spaces")
	}
	items, err := h.s.Reorder(ctx, caller(ctx), stringPtr(r.Msg.ParentId), r.Msg.OrderedIds)
	out := &v1.ReorderSpacesResponse{}
	for _, m := range items {
		out.Spaces = append(out.Spaces, spaceProto(m))
	}
	return response(out, err)
}

type tagHandler struct{ s tag.Service }

func (h tagHandler) List(ctx context.Context, _ *connect.Request[v1.ListTagsRequest]) (*connect.Response[v1.ListTagsResponse], error) {
	if h.s == nil {
		return nil, unavailable("tags")
	}
	items, err := h.s.List(ctx)
	out := &v1.ListTagsResponse{}
	for _, t := range items {
		out.Tags = append(out.Tags, tagProto(t))
	}
	return response(out, err)
}
func (h tagHandler) Create(ctx context.Context, r *connect.Request[v1.CreateTagRequest]) (*connect.Response[v1.CreateTagResponse], error) {
	if h.s == nil {
		return nil, unavailable("tags")
	}
	t, err := h.s.Create(ctx, caller(ctx), r.Msg.Name, stringPtr(r.Msg.Color))
	return response(&v1.CreateTagResponse{Tag: tagProto(t)}, err)
}
func (h tagHandler) Update(ctx context.Context, r *connect.Request[v1.UpdateTagRequest]) (*connect.Response[v1.UpdateTagResponse], error) {
	if h.s == nil {
		return nil, unavailable("tags")
	}
	in := r.Msg
	t, err := h.s.Update(ctx, caller(ctx), in.Id, in.GetExpectedRev(), tag.Patch{Name: in.Name, Color: in.Color, ClearColor: in.ClearColor})
	return response(&v1.UpdateTagResponse{Tag: tagProto(t)}, err)
}
func (h tagHandler) Delete(ctx context.Context, r *connect.Request[v1.DeleteTagRequest]) (*connect.Response[v1.DeleteTagResponse], error) {
	if h.s == nil {
		return nil, unavailable("tags")
	}
	err := h.s.Delete(ctx, caller(ctx), r.Msg.Id)
	return response(&v1.DeleteTagResponse{}, err)
}
func (h tagHandler) Merge(ctx context.Context, r *connect.Request[v1.MergeTagsRequest]) (*connect.Response[v1.MergeTagsResponse], error) {
	if h.s == nil {
		return nil, unavailable("tags")
	}
	m, err := h.s.Merge(ctx, caller(ctx), r.Msg.SourceId, r.Msg.TargetId)
	return response(&v1.MergeTagsResponse{Target: tagProto(m.Target), MovedNoteCount: int32(m.MovedNoteCount)}, err)
}
