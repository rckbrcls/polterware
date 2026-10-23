package core

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/platform/clock"
	"github.com/polterware/polterware/notes/backend/platform/ids"
	attachprovider "github.com/polterware/polterware/notes/backend/providers/attachments"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

var attachmentServices sync.Map

type attachmentServiceEntry struct {
	once    sync.Once
	service attachments.Service
	err     error
}

type attachmentMeta struct {
	store attachments.Store
}

type attachmentComposite struct {
	meta  attachments.Store
	files *attachprovider.Store
}

func (c attachmentComposite) List(ctx context.Context, noteID string) ([]attachments.Attachment, error) {
	return c.meta.List(ctx, noteID)
}

func (c attachmentComposite) Get(ctx context.Context, id string) (attachments.Attachment, error) {
	return c.meta.Get(ctx, id)
}

func (c attachmentComposite) Insert(ctx context.Context, a attachments.Attachment) error {
	return c.meta.Insert(ctx, a)
}

func (c attachmentComposite) Delete(ctx context.Context, id string) error {
	return c.meta.Delete(ctx, id)
}

func (c attachmentComposite) Reorder(ctx context.Context, noteID string, orderedIDs []string) error {
	return c.meta.Reorder(ctx, noteID, orderedIDs)
}

func (c attachmentComposite) ImportFile(ctx context.Context, noteID, attachmentID, sourcePath string) (attachments.ImportedFile, error) {
	if c.files == nil {
		return attachments.ImportedFile{}, fault.Unavailable("attachment files are not available")
	}
	return c.files.ImportFile(ctx, noteID, attachmentID, sourcePath)
}

func (c attachmentComposite) AbsolutePath(relPath string) (string, error) {
	if c.files == nil {
		return "", fault.Unavailable("attachment files are not available")
	}
	return c.files.AbsolutePath(relPath)
}

func (c attachmentComposite) RemoveFile(ctx context.Context, relPath string) error {
	if c.files == nil {
		return fault.Unavailable("attachment files are not available")
	}
	return c.files.RemoveFile(ctx, relPath)
}

func buildAttachmentService(store attachments.Store) (attachments.Service, error) {
	sqliteMeta, ok := store.(sqlite.Attachments)
	if !ok {
		return nil, unavailable("attachment files")
	}
	audit := activity.Audit{Repository: sqliteMeta.Activity(), Transactions: sqliteMeta.Store, Clock: clock.Clock{}, IDs: ids.Generator{}}
	write := func(ctx context.Context, id, op string, fn func(context.Context) error) error {
		return audit.Write(ctx, caller(ctx), "attachment", id, op, "Attachment "+op, fn)
	}
	composite := attachmentComposite{meta: store}
	dbPath := sqliteMeta.Handle().Path()
	if dbPath != ":memory:" {
		files, err := attachprovider.New(sqliteMeta.Handle().Writer(), filepath.Dir(dbPath))
		if err != nil {
			return nil, fmt.Errorf("open attachment files: %w", err)
		}
		// Initialize recovery before publishing the service or accepting imports.
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if _, err := files.SweepOrphansWith(ctx, func(ctx context.Context, id string) error {
			return audit.Write(ctx, actor.System(), "attachment", id, "delete", "Remove attachment with missing file", func(ctx context.Context) error { return store.Delete(ctx, id) })
		}); err != nil {
			return nil, fmt.Errorf("recover attachment files: %w", err)
		}
		composite.files = files
	}
	return attachments.NewService(composite, ids.Generator{}, clock.Clock{}).WithNoteRev(sqliteMeta.Notes(), sqliteMeta.Store).WithAudit(write), nil
}

func (a attachmentMeta) service() (attachments.Service, error) {
	cached, _ := attachmentServices.LoadOrStore(a.store, &attachmentServiceEntry{})
	entry := cached.(*attachmentServiceEntry)
	entry.once.Do(func() { entry.service, entry.err = buildAttachmentService(a.store) })
	return entry.service, entry.err
}

func (a attachmentMeta) ImportFromPath(ctx context.Context, noteID, sourcePath, name string, expectedRev int64) (attachments.Attachment, error) {
	svc, err := a.service()
	if err != nil {
		return attachments.Attachment{}, err
	}
	return svc.ImportFromPath(ctx, noteID, sourcePath, name, expectedRev)
}

func (a attachmentMeta) AddLink(ctx context.Context, noteID, rawURL, title string, expectedRev int64) (attachments.Attachment, error) {
	svc, err := a.service()
	if err != nil {
		return attachments.Attachment{}, err
	}
	return svc.AddLink(ctx, noteID, rawURL, title, expectedRev)
}

func (a attachmentMeta) List(ctx context.Context, noteID string) ([]attachments.Attachment, error) {
	return a.store.List(ctx, noteID)
}

func (a attachmentMeta) Delete(ctx context.Context, id string) error {
	svc, err := a.service()
	if err != nil {
		return err
	}
	return svc.Delete(ctx, id)
}

func (a attachmentMeta) Reorder(ctx context.Context, noteID string, orderedIDs []string) ([]attachments.Attachment, error) {
	svc, err := a.service()
	if err != nil {
		return nil, err
	}
	return svc.Reorder(ctx, noteID, orderedIDs)
}

func (a attachmentMeta) OpenInfo(ctx context.Context, id string) (attachments.OpenInfo, error) {
	svc, err := a.service()
	if err != nil {
		return attachments.OpenInfo{}, err
	}
	return svc.OpenInfo(ctx, id)
}
