package core

import (
	"context"

	"connectrpc.com/connect"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/search"
	"github.com/polterware/polterware/notes/backend/domains/tx"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
	searchprovider "github.com/polterware/polterware/notes/backend/providers/search"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

type searchHandler struct{ s search.Service }

// WireSearch registers the FTS index on the store and returns the search service.
func WireSearch(store *sqlite.Store) search.Service {
	idx := searchprovider.NewWithReader(store.Handle().Writer(), store.Handle().Q(context.Background(), false))
	store.SetIndex(idx)
	return searchRuntime{
		Service:      search.NewService(storeSearchIndex{Index: idx, store: store}, storeDocuments{store: store}),
		transactions: store,
	}
}

// Reindex holds the writer transaction from document collection to FTS rebuild.
type searchRuntime struct {
	search.Service
	transactions tx.Manager
}

func (s searchRuntime) Reindex(ctx context.Context) (int, error) {
	var n int
	err := s.transactions.Within(ctx, func(ctx context.Context) error {
		var err error
		n, err = s.Service.Reindex(ctx)
		return err
	})
	if err != nil {
		return 0, err
	}
	return n, nil
}

// The SQLite adapter joins the collection transaction instead of opening another.
type storeSearchIndex struct {
	search.Index
	store *sqlite.Store
}

func (i storeSearchIndex) Rebuild(ctx context.Context, docs []search.Document) error {
	return i.store.Documents().Rebuild(ctx, docs)
}

type storeDocuments struct{ store *sqlite.Store }

func (s storeDocuments) ListSearchDocuments(ctx context.Context) ([]search.Document, error) {
	rows, err := s.store.Handle().Q(ctx, false).QueryContext(ctx, `SELECT id FROM notes ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	var docs []search.Document
	for _, id := range ids {
		doc, err := s.store.Documents().Document(ctx, id)
		if err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, nil
}

func searchFilterFromRequest(in *v1.SearchNotesRequest) search.Filter {
	return search.Filter{
		SpaceID:            stringPtr(in.SpaceId),
		IncludeDescendants: in.IncludeDescendants,
		TagIDs:             in.TagIds,
		Status:             in.Status,
		DueFrom:            instantPtr(in.DueFrom),
		DueTo:              instantPtr(in.DueTo),
		UpdatedFrom:        instantPtr(in.UpdatedFrom),
		UpdatedTo:          instantPtr(in.UpdatedTo),
		Limit:              int(in.Limit),
	}
}

func (h searchHandler) Search(ctx context.Context, r *connect.Request[v1.SearchNotesRequest]) (*connect.Response[v1.SearchNotesResponse], error) {
	if h.s == nil {
		return nil, unavailable("search")
	}
	in := r.Msg
	result, err := h.s.Search(ctx, in.Query, searchFilterFromRequest(in))
	out := &v1.SearchNotesResponse{Notice: result.Notice}
	for _, hit := range result.Hits {
		out.Hits = append(out.Hits, &v1.SearchHit{NoteId: hit.NoteID, Title: hit.Title, Score: hit.Score, Snippet: hit.Snippet, MatchedIn: hit.MatchedIn})
	}
	return response(out, err)
}
func (h searchHandler) Status(ctx context.Context, _ *connect.Request[v1.SearchStatusRequest]) (*connect.Response[v1.SearchStatusResponse], error) {
	if h.s == nil {
		return nil, unavailable("search")
	}
	s, err := h.s.Status(ctx)
	return response(&v1.SearchStatusResponse{FtsDocuments: int32(s.FTSDocuments)}, err)
}
func (h searchHandler) Reindex(ctx context.Context, _ *connect.Request[v1.ReindexRequest]) (*connect.Response[v1.ReindexResponse], error) {
	if h.s == nil {
		return nil, unavailable("search")
	}
	n, err := h.s.Reindex(ctx)
	return response(&v1.ReindexResponse{Notes: int32(n)}, err)
}

type attachmentHandler struct{ s attachments.Service }

func (h attachmentHandler) ImportFromPath(ctx context.Context, r *connect.Request[v1.ImportAttachmentRequest]) (*connect.Response[v1.ImportAttachmentResponse], error) {
	if h.s == nil {
		return nil, unavailable("attachments")
	}
	in := r.Msg
	a, err := h.s.ImportFromPath(ctx, in.NoteId, in.SourcePath, in.Name, in.GetExpectedRev())
	return response(&v1.ImportAttachmentResponse{Attachment: attachmentProto(a)}, err)
}
func (h attachmentHandler) AddLink(ctx context.Context, r *connect.Request[v1.AddLinkRequest]) (*connect.Response[v1.AddLinkResponse], error) {
	if h.s == nil {
		return nil, unavailable("attachments")
	}
	in := r.Msg
	a, err := h.s.AddLink(ctx, in.NoteId, in.Url, in.Title, in.GetExpectedRev())
	return response(&v1.AddLinkResponse{Attachment: attachmentProto(a)}, err)
}
func (h attachmentHandler) List(ctx context.Context, r *connect.Request[v1.ListAttachmentsRequest]) (*connect.Response[v1.ListAttachmentsResponse], error) {
	if h.s == nil {
		return nil, unavailable("attachments")
	}
	items, err := h.s.List(ctx, r.Msg.NoteId)
	out := &v1.ListAttachmentsResponse{}
	for _, a := range items {
		out.Attachments = append(out.Attachments, attachmentProto(a))
	}
	return response(out, err)
}
func (h attachmentHandler) Delete(ctx context.Context, r *connect.Request[v1.DeleteAttachmentRequest]) (*connect.Response[v1.DeleteAttachmentResponse], error) {
	if h.s == nil {
		return nil, unavailable("attachments")
	}
	err := h.s.Delete(ctx, r.Msg.Id)
	return response(&v1.DeleteAttachmentResponse{}, err)
}
func (h attachmentHandler) Reorder(ctx context.Context, r *connect.Request[v1.ReorderAttachmentsRequest]) (*connect.Response[v1.ReorderAttachmentsResponse], error) {
	if h.s == nil {
		return nil, unavailable("attachments")
	}
	items, err := h.s.Reorder(ctx, r.Msg.NoteId, r.Msg.OrderedIds)
	out := &v1.ReorderAttachmentsResponse{}
	for _, a := range items {
		out.Attachments = append(out.Attachments, attachmentProto(a))
	}
	return response(out, err)
}
func (h attachmentHandler) OpenInfo(ctx context.Context, r *connect.Request[v1.OpenAttachmentInfoRequest]) (*connect.Response[v1.OpenAttachmentInfoResponse], error) {
	if h.s == nil {
		return nil, unavailable("attachments")
	}
	i, err := h.s.OpenInfo(ctx, r.Msg.Id)
	return response(&v1.OpenAttachmentInfoResponse{Id: i.ID, AbsolutePath: i.AbsolutePath, Mime: i.Mime, Name: i.Name, Kind: i.Kind}, err)
}
