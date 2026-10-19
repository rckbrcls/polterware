package core

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/clock"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/maintenance"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
	"github.com/polterware/polterware/notes/backend/platform/privatedest"
	"github.com/polterware/polterware/notes/backend/providers/sqlite"
)

type exportNote struct {
	note.Note
	Checklist   []note.CheckItem         `json:"checklist"`
	TagIDs      []string                 `json:"tagIds"`
	Completions []note.Completion        `json:"completions"`
	Schedule    *schedule.Schedule       `json:"schedule,omitempty"`
	Place       *place.Place             `json:"place,omitempty"`
	Attachments []attachments.Attachment `json:"attachments"`
}

type exportDoc struct {
	Version    string            `json:"version"`
	ExportedAt time.Time         `json:"exportedAt"`
	Spaces     []space.Space     `json:"spaces"`
	Notes      []exportNote      `json:"notes"`
	Tags       []tag.Tag         `json:"tags"`
	Settings   settings.Settings `json:"settings"`
	Activity   []activity.Event  `json:"activity"`
}

type maintenanceService struct {
	store       *sqlite.Store
	spaces      space.Repository
	notes       note.Repository
	tags        tag.Repository
	schedules   schedule.Repository
	places      place.Repository
	attachments attachments.Store
	activity    activity.Repository
	settings    settings.Service
	clock       clock.Clock
}

func (s maintenanceService) Export(ctx context.Context, zipPath string) (int64, error) {
	if zipPath == "" {
		return 0, invalid("zip_path", "required")
	}
	doc, err := s.snapshot(ctx)
	if err != nil {
		return 0, err
	}
	return privatedest.Write(ctx, zipPath, func(file *os.File) error {
		z := zip.NewWriter(file)
		w, err := z.Create("data.json")
		if err != nil {
			return err
		}
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		if err := enc.Encode(doc); err != nil {
			return err
		}
		if _, err := z.Create("attachments/"); err != nil {
			return err
		}
		return z.Close()
	})
}

func (s maintenanceService) snapshot(ctx context.Context) (exportDoc, error) {
	doc := exportDoc{Version: "notes-export-v1", ExportedAt: s.clock.Now().UTC()}
	var err error
	if doc.Spaces, err = s.spaces.List(ctx); err != nil {
		return exportDoc{}, err
	}
	if doc.Tags, err = s.tags.List(ctx); err != nil {
		return exportDoc{}, err
	}
	if doc.Settings, err = s.settings.Get(ctx); err != nil {
		return exportDoc{}, err
	}
	cursor := ""
	for {
		page, err := s.notes.List(ctx, note.ListFilter{Limit: 500, Cursor: cursor})
		if err != nil {
			return exportDoc{}, err
		}
		for _, summary := range page.Notes {
			item, err := s.exportNote(ctx, summary.ID)
			if err != nil {
				return exportDoc{}, err
			}
			doc.Notes = append(doc.Notes, item)
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	cursor = ""
	for {
		page, err := s.activity.List(ctx, cursor, "", 500)
		if err != nil {
			return exportDoc{}, err
		}
		doc.Activity = append(doc.Activity, page.Events...)
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	return doc, nil
}

func (s maintenanceService) exportNote(ctx context.Context, id string) (exportNote, error) {
	m, err := s.notes.Get(ctx, id)
	if err != nil {
		return exportNote{}, err
	}
	item := exportNote{Note: m}
	if item.Checklist, err = s.notes.ListCheckItems(ctx, id); err != nil {
		return exportNote{}, err
	}
	if item.TagIDs, err = s.notes.ListTagIDs(ctx, id); err != nil {
		return exportNote{}, err
	}
	if item.Completions, err = s.notes.ListCompletions(ctx, id); err != nil {
		return exportNote{}, err
	}
	if item.Attachments, err = s.attachments.List(ctx, id); err != nil {
		return exportNote{}, err
	}
	if sc, err := s.schedules.Get(ctx, id); err == nil {
		item.Schedule = &sc
	} else if !fault.IsCode(err, fault.CodeNotFound) {
		return exportNote{}, err
	}
	if p, err := s.places.Get(ctx, id); err == nil {
		item.Place = &p
	} else if !fault.IsCode(err, fault.CodeNotFound) {
		return exportNote{}, err
	}
	return item, nil
}

func (s maintenanceService) Backup(ctx context.Context, destPath string) (string, int64, error) {
	if destPath == "" {
		return "", 0, invalid("dest_path", "required")
	}
	n, err := s.store.Backup(ctx, destPath)
	return destPath, n, err
}

func (s maintenanceService) Doctor(ctx context.Context) (maintenance.Report, error) {
	report := maintenance.Report{OK: true}
	add := func(name string, ok bool, detail string) {
		report.Checks = append(report.Checks, maintenance.Check{Name: name, OK: ok, Detail: detail})
		if !ok {
			report.OK = false
		}
	}
	var integrity string
	if err := s.store.Handle().Writer().QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&integrity); err != nil {
		add("integrity_check", false, err.Error())
	} else {
		add("integrity_check", integrity == "ok", integrity)
	}
	rows, err := s.store.Handle().Writer().QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		add("foreign_key_check", false, err.Error())
	} else {
		defer rows.Close()
		n := 0
		for rows.Next() {
			n++
		}
		add("foreign_key_check", n == 0, fmt.Sprintf("%d violations", n))
	}
	add("sqlite", true, s.store.Handle().Path())
	add("change_feed", true, "committed transactions only")
	return report, nil
}
