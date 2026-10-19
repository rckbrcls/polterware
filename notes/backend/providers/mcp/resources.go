package mcp

import (
	"context"
	"strings"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/domains/note"
)

func (s *Server) addResourcesAndPrompts() {
	s.sdk.AddResource(&mcpsdk.Resource{URI: "pwnotes://spaces", Name: "spaces", MIMEType: "text/plain", Description: "Space tree."}, s.readSpaces)
	s.sdk.AddResource(&mcpsdk.Resource{URI: "pwnotes://today", Name: "today", MIMEType: "text/plain", Description: "Now and today's plate."}, s.readToday)
	s.sdk.AddResourceTemplate(&mcpsdk.ResourceTemplate{URITemplate: "pwnotes://note/{id}", Name: "note", MIMEType: "text/plain", Description: "One note."}, s.readNote)
	s.sdk.AddPrompt(&mcpsdk.Prompt{Name: "plan_day", Description: "Plan today from Inbox and occurrences."}, promptText("List today's occurrences and Inbox, then propose a short plan. Use list_occurrences and list_notes."))
	s.sdk.AddPrompt(&mcpsdk.Prompt{Name: "weekly_review", Description: "Weekly review from get_review."}, promptText("Call get_review for this week. Summarize streak, completed, and focus minutes. Do not start a timer."))
	s.sdk.AddPrompt(&mcpsdk.Prompt{Name: "capture", Description: "Turn free text into create_notes arguments."}, promptText("Turn the user's notes into create_notes items. Use space and tag names. Confirm schedule next occurrences."))
}

func promptText(text string) mcpsdk.PromptHandler {
	return func(context.Context, *mcpsdk.GetPromptRequest) (*mcpsdk.GetPromptResult, error) {
		return &mcpsdk.GetPromptResult{Messages: []*mcpsdk.PromptMessage{{Role: "user", Content: &mcpsdk.TextContent{Text: text}}}}, nil
	}
}

func (s *Server) readSpaces(ctx context.Context, req *mcpsdk.ReadResourceRequest) (*mcpsdk.ReadResourceResult, error) {
	rows, err := s.deps.Spaces.List(ctx)
	if err != nil {
		return nil, err
	}
	sess := s.sessionFor(req.Session)
	for _, row := range rows {
		sess.observeSpace(row.ID, row.Rev)
	}
	text := spaceTreeText(rows, nil)
	if text == "" {
		text = "0 spaces"
	}
	return &mcpsdk.ReadResourceResult{Contents: []*mcpsdk.ResourceContents{{URI: "pwnotes://spaces", MIMEType: "text/plain", Text: text}}}, nil
}

func (s *Server) readToday(ctx context.Context, req *mcpsdk.ReadResourceRequest) (*mcpsdk.ReadResourceResult, error) {
	now := s.deps.now()
	text := now.Format("Mon 2006-01-02 15:04 MST")
	snapshots := []note.Note{}
	if s.deps.Schedules != nil {
		read := func(ctx context.Context) error {
			from := startOfDay(now)
			rows, err := s.deps.Schedules.ListOccurrences(ctx, from, from.Add(24*time.Hour), nil, true, DefaultLimit)
			if err != nil {
				return err
			}
			titles := make([]string, 0, len(rows))
			for _, row := range rows {
				got, err := s.deps.Notes.Get(ctx, row.NoteID, note.Include{})
				if err != nil {
					return err
				}
				titles = append(titles, got.Note.Title)
				snapshots = append(snapshots, got.Note)
			}
			if len(titles) > 0 {
				text += "\n" + strings.Join(titles, ", ")
			}
			return nil
		}
		var err error
		if s.deps.Within != nil {
			err = s.deps.Within(ctx, read)
		} else {
			err = read(ctx)
		}
		if err != nil {
			return nil, err
		}
	}
	sess := s.sessionFor(req.Session)
	for _, m := range snapshots {
		sess.observe(m.ID, m.Rev)
	}
	return &mcpsdk.ReadResourceResult{Contents: []*mcpsdk.ResourceContents{{URI: "pwnotes://today", MIMEType: "text/plain", Text: text}}}, nil
}

func (s *Server) readNote(ctx context.Context, req *mcpsdk.ReadResourceRequest) (*mcpsdk.ReadResourceResult, error) {
	id := strings.TrimPrefix(req.Params.URI, "pwnotes://note/")
	got, err := s.sessionFor(req.Session).Get(ctx, id, note.Include{})
	if err != nil {
		return nil, err
	}
	return &mcpsdk.ReadResourceResult{Contents: []*mcpsdk.ResourceContents{{URI: req.Params.URI, MIMEType: "text/plain", Text: got.Note.Title}}}, nil
}

func startOfDay(now time.Time) time.Time {
	loc := now.Location()
	if loc == nil {
		loc = time.UTC
	}
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
}
