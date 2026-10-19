package attachments

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/clock"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/ids"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/tx"
)

type ServiceImpl struct {
	mu    sync.Mutex
	store Store
	ids   ids.Generator
	clock clock.Clock
	notes note.Repository
	tx    tx.Manager
	audit func(context.Context, string, string, func(context.Context) error) error
}

func NewService(store Store, generator ids.Generator, c clock.Clock) *ServiceImpl {
	return &ServiceImpl{store: store, ids: generator, clock: c}
}

func (s *ServiceImpl) WithNoteRev(notes note.Repository, tx tx.Manager) *ServiceImpl {
	s.notes = notes
	s.tx = tx
	return s
}

// WithAudit joins metadata mutations and activity in the same transaction.
func (s *ServiceImpl) WithAudit(write func(context.Context, string, string, func(context.Context) error) error) *ServiceImpl {
	s.audit = write
	return s
}

func (s *ServiceImpl) mutate(ctx context.Context, id, op string, fn func(context.Context) error) error {
	if s.audit != nil {
		return s.audit(ctx, id, op, fn)
	}
	return s.within(ctx, fn)
}

func (s *ServiceImpl) cleanup(ctx context.Context, rel string, cause error) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.store.RemoveFile(cleanupCtx, rel); err != nil {
		return errors.Join(cause, fmt.Errorf("cleanup attachment %s: %w", rel, err))
	}
	return cause
}

func (s *ServiceImpl) within(ctx context.Context, fn func(context.Context) error) error {
	if s.tx == nil {
		return fn(ctx)
	}
	return s.tx.Within(ctx, fn)
}

func (s *ServiceImpl) checkNoteRev(ctx context.Context, noteID string, expectedRev int64) error {
	if expectedRev == 0 {
		return nil
	}
	if s.notes == nil {
		return fault.Unavailable("note revision check is not wired")
	}
	m, err := s.notes.Get(ctx, noteID)
	if err != nil {
		return err
	}
	if m.Rev != expectedRev {
		return fault.Conflict("note", noteID, m.Rev, m)
	}
	return nil
}

func (s *ServiceImpl) ImportFromPath(ctx context.Context, noteID, sourcePath, name string, expectedRev int64) (Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if noteID == "" || sourcePath == "" {
		return Attachment{}, fault.Invalid(fault.Violation{Field: "source_path", Reason: "required"})
	}
	id := s.ids.New()
	file, err := s.store.ImportFile(ctx, noteID, id, sourcePath)
	if err != nil {
		return Attachment{}, err
	}
	kind := KindFile
	if strings.HasPrefix(file.Mime, "image/") {
		kind = KindPhoto
	}
	if strings.HasPrefix(file.Mime, "audio/") {
		kind = KindAudio
	}
	limit := min(ByteLimit(file.Mime), ImportLimit(ctx))
	if file.SizeBytes > limit {
		return Attachment{}, s.cleanup(ctx, file.RelPath, fault.Exhausted("attachment exceeds kind size limit"))
	}
	if name == "" {
		name = filepath.Base(sourcePath)
	}
	mime, size, hash, rel := file.Mime, file.SizeBytes, file.SHA256, file.RelPath
	a := Attachment{ID: id, NoteID: noteID, Kind: kind, Name: &name, Mime: &mime, SizeBytes: &size, SHA256: &hash, RelPath: &rel, CreatedAt: s.clock.Now().UTC()}
	var duplicate *Attachment
	if err = s.within(ctx, func(ctx context.Context) error {
		if err := s.checkNoteRev(ctx, noteID, expectedRev); err != nil {
			return err
		}
		prior, err := s.store.List(ctx, noteID)
		if err != nil {
			return err
		}
		for _, existing := range prior {
			if existing.SHA256 != nil && *existing.SHA256 == file.SHA256 {
				duplicate = &existing
				return nil
			}
		}
		return s.mutate(ctx, a.ID, "create", func(ctx context.Context) error { return s.store.Insert(ctx, a) })
	}); err != nil {
		return Attachment{}, s.cleanup(ctx, rel, err)
	}
	if duplicate != nil {
		if err := s.cleanup(ctx, rel, nil); err != nil {
			return Attachment{}, err
		}
		return *duplicate, nil
	}
	return a, nil
}

func (s *ServiceImpl) AddLink(ctx context.Context, noteID, rawURL, title string, expectedRev int64) (Attachment, error) {
	// Link insertion is serialized by the writer transaction. Avoid taking
	// the file-import mutex when joining an already-open transaction.
	u, err := url.ParseRequestURI(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return Attachment{}, fault.Invalid(fault.Violation{Field: "url", Reason: "must be an http or https URL"})
	}
	a := Attachment{ID: s.ids.New(), NoteID: noteID, Kind: KindLink, URL: &rawURL, CreatedAt: s.clock.Now().UTC()}
	if title != "" {
		a.Title = &title
	}
	err = s.mutate(ctx, a.ID, "create", func(ctx context.Context) error {
		if err := s.checkNoteRev(ctx, noteID, expectedRev); err != nil {
			return err
		}
		return s.store.Insert(ctx, a)
	})
	if err != nil {
		return Attachment{}, err
	}
	return a, nil
}
func (s *ServiceImpl) List(ctx context.Context, noteID string) ([]Attachment, error) {
	return s.store.List(ctx, noteID)
}
func (s *ServiceImpl) Reorder(ctx context.Context, noteID string, ids []string) ([]Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.mutate(ctx, noteID, "update", func(ctx context.Context) error { return s.store.Reorder(ctx, noteID, ids) }); err != nil {
		return nil, err
	}
	return s.store.List(ctx, noteID)
}
func (s *ServiceImpl) OpenInfo(ctx context.Context, id string) (OpenInfo, error) {
	a, err := s.store.Get(ctx, id)
	if err != nil {
		return OpenInfo{}, err
	}
	if a.RelPath == nil {
		return OpenInfo{}, fault.Invalid(fault.Violation{Field: "id", Reason: "links have no local file"})
	}
	p, err := s.store.AbsolutePath(*a.RelPath)
	if err != nil {
		return OpenInfo{}, err
	}
	mime, name := "application/octet-stream", ""
	if a.Mime != nil {
		mime = *a.Mime
	}
	if a.Name != nil {
		name = *a.Name
	}
	return OpenInfo{ID: a.ID, AbsolutePath: p, Mime: mime, Name: name, Kind: a.Kind}, nil
}
func (s *ServiceImpl) Delete(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, err := s.store.Get(ctx, id)
	if err != nil {
		return err
	}
	if err = s.mutate(ctx, id, "delete", func(ctx context.Context) error { return s.store.Delete(ctx, id) }); err != nil {
		return err
	}
	if a.RelPath != nil {
		if err = s.cleanup(ctx, *a.RelPath, nil); err != nil {
			return err
		}
	}
	return nil
}

var _ Service = (*ServiceImpl)(nil)
