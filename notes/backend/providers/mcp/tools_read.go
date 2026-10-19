package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/search"
)

func (s *Server) getCurrentTime(context.Context, *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	now := s.deps.now()
	loc := now.Location()
	if loc == nil {
		loc = time.UTC
		now = now.In(loc)
	}
	_, week := now.ISOWeek()
	out := map[string]any{"now": now.Format(time.RFC3339), "tz": loc.String(), "weekday": now.Weekday().String(), "isoWeek": week}
	return ok(now.Format(time.RFC3339), out), nil
}

func (s *Server) listSpaces(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Parent string `json:"parent"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	rows, err := s.deps.Spaces.List(ctx)
	if err != nil {
		return fail(err), nil
	}
	sess := s.session(req)
	for _, row := range rows {
		sess.observeSpace(row.ID, row.Rev)
	}
	var parent *string
	if in.Parent != "" {
		got, err := resolveSpace(ctx, s.deps.Spaces, in.Parent)
		if err != nil {
			return fail(err), nil
		}
		parent = &got.ID
	}
	text := spaceTreeText(rows, parent)
	if text == "" {
		text = "0 spaces"
	}
	count := 0
	for _, row := range rows {
		if parent == nil && row.ParentID == nil {
			count++
		} else if parent != nil && row.ParentID != nil && *row.ParentID == *parent {
			count++
		}
	}
	return ok(text, map[string]any{"spaces": text, "total": count}), nil
}

func (s *Server) listTags(ctx context.Context, _ *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	if s.deps.Tags == nil {
		return fail(fault.Unavailable("tags backend is not wired")), nil
	}
	rows, err := s.deps.Tags.List(ctx)
	if err != nil {
		return fail(err), nil
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, tagJSON(row))
	}
	return ok(fmt.Sprintf("%d tags", len(out)), map[string]any{"tags": out}), nil
}

func (s *Server) listNotes(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Space              string `json:"space"`
		IncludeDescendants bool   `json:"includeDescendants"`
		Tag                string `json:"tag"`
		Status             string `json:"status"`
		Pinned             *bool  `json:"pinned"`
		DueFrom            string `json:"dueFrom"`
		DueTo              string `json:"dueTo"`
		UpdatedFrom        string `json:"updatedFrom"`
		UpdatedTo          string `json:"updatedTo"`
		HasSchedule        *bool  `json:"hasSchedule"`
		Query              string `json:"query"`
		Order              string `json:"order"`
		Limit              int    `json:"limit"`
		Cursor             string `json:"cursor"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	limit, err := limitOf(in.Limit)
	if err != nil {
		return fail(err), nil
	}
	filter := note.ListFilter{IncludeDescendants: in.IncludeDescendants, Status: in.Status, Pinned: in.Pinned, HasSchedule: in.HasSchedule, Query: in.Query, Order: in.Order, Limit: limit, Cursor: in.Cursor}
	if in.Space != "" {
		id, err := optionalSpace(ctx, s.deps.Spaces, in.Space)
		if err != nil {
			return fail(err), nil
		}
		filter.SpaceID = id
	}
	if in.Tag != "" {
		if s.deps.Tags == nil {
			return fail(fault.Unavailable("tags backend is not wired")), nil
		}
		got, err := resolveTag(ctx, s.deps.Tags, in.Tag)
		if err != nil {
			return fail(err), nil
		}
		filter.TagIDs = []string{got.ID}
	}
	if filter.DueFrom, err = parseInstant(in.DueFrom, "dueFrom"); err != nil {
		return fail(err), nil
	}
	if filter.DueTo, err = parseInstant(in.DueTo, "dueTo"); err != nil {
		return fail(err), nil
	}
	if filter.UpdatedFrom, err = parseInstant(in.UpdatedFrom, "updatedFrom"); err != nil {
		return fail(err), nil
	}
	if filter.UpdatedTo, err = parseInstant(in.UpdatedTo, "updatedTo"); err != nil {
		return fail(err), nil
	}
	page, err := s.session(req).List(ctx, filter)
	if err != nil {
		return fail(err), nil
	}
	summaries, err := s.summaries(ctx, page.Notes)
	if err != nil {
		return fail(err), nil
	}
	out := map[string]any{"notes": summaries, "total": page.Total}
	if page.NextCursor != "" {
		out["nextCursor"] = page.NextCursor
	}
	return ok(fmt.Sprintf("%d notes", page.Total), out), nil
}

func (s *Server) searchNotes(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Query string `json:"query"`
		Space string `json:"space"`
		Tag   string `json:"tag"`
		Limit int    `json:"limit"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if in.Query == "" {
		return fail(fmt.Errorf("query is required")), nil
	}
	limit, err := limitOf(in.Limit)
	if err != nil {
		return fail(err), nil
	}
	var spaceID *string
	if in.Space != "" {
		spaceID, err = optionalSpace(ctx, s.deps.Spaces, in.Space)
		if err != nil {
			return fail(err), nil
		}
	}
	var tagIDs []string
	if in.Tag != "" {
		if s.deps.Tags == nil {
			return fail(fault.Unavailable("tags backend is not wired")), nil
		}
		got, err := resolveTag(ctx, s.deps.Tags, in.Tag)
		if err != nil {
			return fail(err), nil
		}
		tagIDs = []string{got.ID}
	}
	if s.deps.Search == nil {
		page, err := s.deps.Notes.List(ctx, note.ListFilter{SpaceID: spaceID, TagIDs: tagIDs, Limit: MaxLimit})
		if err != nil {
			return fail(err), nil
		}
		needle := strings.ToLower(in.Query)
		hits := make([]map[string]any, 0, limit)
		for _, item := range page.Notes {
			blob := strings.ToLower(item.Title + " " + item.Snippet)
			if !strings.Contains(blob, needle) {
				continue
			}
			s.session(req).observe(item.ID, item.Rev)
			hits = append(hits, map[string]any{"id": item.ID, "rev": item.Rev, "title": item.Title, "score": 0, "snippet": clipSnippet(item.Snippet)})
			if len(hits) >= limit {
				break
			}
		}
		return ok(fmt.Sprintf("%d hits", len(hits)), map[string]any{"hits": hits, "notice": "ranked search is not wired; results are unranked title matches"}), nil
	}
	var result search.Result
	hits := make([]map[string]any, 0, limit)
	snapshots := make([]note.Note, 0, limit)
	read := func(ctx context.Context) error {
		var err error
		result, err = s.deps.Search.Search(ctx, in.Query, search.Filter{SpaceID: spaceID, TagIDs: tagIDs, Limit: limit})
		if err != nil {
			return err
		}
		for _, hit := range result.Hits {
			got, err := s.deps.Notes.Get(ctx, hit.NoteID, note.Include{Content: true})
			if fault.IsCode(err, fault.CodeNotFound) {
				continue
			}
			if err != nil {
				return err
			}
			// Hydrate the returned entity from the same snapshot as its revision.
			snippet := got.Note.Content
			if s.deps.Within != nil {
				snippet = hit.Snippet
			}
			row := map[string]any{"id": got.Note.ID, "title": got.Note.Title, "rev": got.Note.Rev, "score": hit.Score, "snippet": clipSnippet(snippet)}
			if len(hit.MatchedIn) > 0 {
				row["matchedIn"] = hit.MatchedIn
			}
			hits = append(hits, row)
			snapshots = append(snapshots, got.Note)
		}
		return nil
	}
	if s.deps.Within != nil {
		err = s.deps.Within(ctx, read)
	} else {
		err = read(ctx)
	}
	if err != nil {
		return fail(err), nil
	}
	sess := s.session(req)
	for _, snapshot := range snapshots {
		sess.observe(snapshot.ID, snapshot.Rev)
	}
	out := map[string]any{"hits": hits}
	if result.Notice != "" {
		out["notice"] = result.Notice
	}
	return ok(fmt.Sprintf("%d hits", len(hits)), out), nil
}

func (s *Server) getNote(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		ID      string   `json:"id"`
		Include []string `json:"include"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if in.ID == "" {
		return fail(fmt.Errorf("id is required")), nil
	}
	wanted := map[string]bool{}
	if len(in.Include) == 0 {
		wanted["content"], wanted["checklist"], wanted["schedule"] = true, true, true
	} else {
		for _, name := range in.Include {
			wanted[name] = true
		}
	}
	got, err := s.session(req).Get(ctx, in.ID, note.Include{Content: wanted["content"], Checklist: wanted["checklist"], Completions: wanted["completions"], Tags: true})
	if err != nil {
		return fail(err), nil
	}
	if !wanted["content"] {
		got.Note.Content = ""
	}
	var tagNames []string
	if s.deps.Tags != nil {
		tagNames, err = s.tagNames(ctx, got.TagIDs)
		if err != nil {
			return fail(err), nil
		}
	}
	var sched *scheduleLookup
	if wanted["schedule"] {
		sched, err = s.lookupSchedule(ctx, in.ID)
		if err != nil {
			return fail(err), nil
		}
	}
	var placed *placeLookup
	if wanted["place"] {
		placed, err = s.lookupPlace(ctx, in.ID)
		if err != nil {
			return fail(err), nil
		}
	}
	var files []attachments.Attachment
	if wanted["attachments"] && s.deps.Attachments != nil {
		items, err := s.deps.Attachments.List(ctx, in.ID)
		if err != nil {
			return fail(err), nil
		}
		files = items
	}
	var schedPtr *schedule.Schedule
	var rule schedule.Rule
	if sched != nil {
		schedPtr, rule = &sched.row, sched.rule
	}
	var placePtr *place.Place
	if placed != nil {
		placePtr = &placed.row
	}
	body := noteJSON(got.Note, got.Checklist, tagNames, schedPtr, rule, placePtr, files, got.Completions)
	return ok(got.Note.Title, body), nil
}

func (s *Server) listOccurrences(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		From             string `json:"from"`
		To               string `json:"to"`
		Space            string `json:"space"`
		IncludeCompleted bool   `json:"includeCompleted"`
		Limit            int    `json:"limit"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	from, err := parseInstant(in.From, "from")
	if err != nil || from == nil {
		if err == nil {
			err = fmt.Errorf("from is required")
		}
		return fail(err), nil
	}
	to, err := parseInstant(in.To, "to")
	if err != nil || to == nil {
		if err == nil {
			err = fmt.Errorf("to is required")
		}
		return fail(err), nil
	}
	limit, err := limitOf(in.Limit)
	if err != nil {
		return fail(err), nil
	}
	if s.deps.Schedules == nil {
		return fail(fault.Unavailable("schedule backend is not wired")), nil
	}
	var spaceID *string
	if in.Space != "" {
		spaceID, err = optionalSpace(ctx, s.deps.Spaces, in.Space)
		if err != nil {
			return fail(err), nil
		}
	}
	rows, err := s.deps.Schedules.ListOccurrences(ctx, *from, *to, spaceID, in.IncludeCompleted, limit)
	if err != nil {
		return fail(err), nil
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		item := map[string]any{"id": row.NoteID, "title": row.Title, "at": row.OccurrenceAt.UTC().Format(time.RFC3339), "completed": row.Completed, "overdue": row.Overdue}
		if row.AllDay {
			item["allDay"] = true
		}
		out = append(out, item)
	}
	return ok(fmt.Sprintf("%d occurrences", len(out)), map[string]any{"occurrences": out}), nil
}

func (s *Server) getReview(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Period string `json:"period"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if s.deps.Review == nil {
		return fail(fault.Unavailable("review backend is not wired")), nil
	}
	now := s.deps.now()
	loc := now.Location()
	if loc == nil {
		loc = time.Local
		now = now.In(loc)
	}
	from, to := reviewWindow(in.Period, now)
	report, err := s.deps.Review.Get(ctx, from, to, loc.String())
	if err != nil {
		return fail(err), nil
	}
	days := make([]map[string]any, 0, len(report.Days))
	for _, day := range report.Days {
		days = append(days, map[string]any{"date": day.Date, "completed": day.Completed, "focusMin": day.FocusMinutes})
	}
	out := map[string]any{
		"streak": report.Streak, "completed": report.CompletedTotal, "focusMinutes": report.FocusMinutes,
		"streakMood": report.StreakMood, "completedMood": report.CompletedMood, "days": days,
	}
	return ok(fmt.Sprintf("streak %d, completed %d. Focus timer lives in the window.", report.Streak, report.CompletedTotal), out), nil
}

func (s *Server) listActivity(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var in struct {
		Limit int    `json:"limit"`
		Actor string `json:"actor"`
	}
	if err := decodeArgs(req, &in); err != nil {
		return fail(err), nil
	}
	if s.deps.Activity == nil {
		return fail(fault.Unavailable("activity backend is not wired")), nil
	}
	limit, err := limitOf(in.Limit)
	if err != nil {
		return fail(err), nil
	}
	page, err := s.deps.Activity.List(ctx, "", in.Actor, limit)
	if err != nil {
		return fail(err), nil
	}
	events := make([]map[string]any, 0, len(page.Events))
	for _, event := range page.Events {
		events = append(events, activityJSON(event))
	}
	out := map[string]any{"events": events}
	if page.NextCursor != "" {
		out["nextCursor"] = page.NextCursor
	}
	return ok(fmt.Sprintf("%d events", len(events)), out), nil
}

func reviewWindow(period string, now time.Time) (time.Time, time.Time) {
	loc := now.Location()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	to := now.Add(time.Nanosecond)
	switch period {
	case "month":
		return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc), to
	case "year":
		return time.Date(now.Year(), 1, 1, 0, 0, 0, 0, loc), to
	default:
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		return start.AddDate(0, 0, -(weekday - 1)), to
	}
}

func decodeArgs(req *mcpsdk.CallToolRequest, dest any) error {
	if req == nil || len(req.Params.Arguments) == 0 {
		return json.Unmarshal([]byte("{}"), dest)
	}
	if err := json.Unmarshal(req.Params.Arguments, dest); err != nil {
		return fault.Invalid(fault.Violation{Field: "arguments", Reason: "invalid JSON"})
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(req.Params.Arguments, &fields); err != nil {
		return err
	}
	if raw, present := fields["expectedRev"]; present {
		var rev int64
		if err := json.Unmarshal(raw, &rev); err == nil {
			if rev <= 0 {
				return fmt.Errorf("expectedRev must be positive")
			}
		} else {
			var revs map[string]int64
			if err := json.Unmarshal(raw, &revs); err != nil {
				return fmt.Errorf("expectedRev must be a positive revision or revision map")
			}
			for _, rev := range revs {
				if rev <= 0 {
					return fmt.Errorf("expectedRev must be positive")
				}
			}
		}
	}
	return nil
}

type scheduleLookup struct {
	row  schedule.Schedule
	rule schedule.Rule
}
type placeLookup struct{ row place.Place }

func (s *Server) lookupSchedule(ctx context.Context, id string) (*scheduleLookup, error) {
	if s.deps.GetSchedule == nil {
		return nil, nil
	}
	row, err := s.deps.GetSchedule(ctx, id)
	if err != nil {
		if fault.IsCode(err, fault.CodeNotFound) {
			return nil, nil
		}
		return nil, err
	}
	loc, err := time.LoadLocation(row.TZ)
	if err != nil {
		loc = time.UTC
	}
	rule, err := row.Rule(loc)
	if err != nil {
		return &scheduleLookup{row: row}, nil
	}
	return &scheduleLookup{row: row, rule: rule}, nil
}

func (s *Server) lookupPlace(ctx context.Context, id string) (*placeLookup, error) {
	if s.deps.GetPlace == nil {
		return nil, nil
	}
	row, err := s.deps.GetPlace(ctx, id)
	if err != nil {
		if fault.IsCode(err, fault.CodeNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &placeLookup{row: row}, nil
}

func (s *Server) summaries(ctx context.Context, items []note.Summary) ([]map[string]any, error) {
	names := map[string]string{}
	if s.deps.Spaces != nil {
		rows, err := s.deps.Spaces.List(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			names[row.ID] = row.Name
		}
	}
	tagNames := map[string]string{}
	if s.deps.Tags != nil {
		rows, err := s.deps.Tags.List(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			tagNames[row.ID] = row.Name
		}
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		spaceName := ""
		if item.SpaceID != nil {
			spaceName = names[*item.SpaceID]
		}
		labels := make([]string, 0, len(item.TagIDs))
		for _, id := range item.TagIDs {
			if tagNames[id] != "" {
				labels = append(labels, tagNames[id])
			} else {
				labels = append(labels, id)
			}
		}
		out = append(out, noteSummary(item, spaceName, labels))
	}
	return out, nil
}

func (s *Server) tagNames(ctx context.Context, ids []string) ([]string, error) {
	if len(ids) == 0 || s.deps.Tags == nil {
		return nil, nil
	}
	rows, err := s.deps.Tags.List(ctx)
	if err != nil {
		return nil, err
	}
	index := map[string]string{}
	for _, row := range rows {
		index[row.ID] = row.Name
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if index[id] != "" {
			out = append(out, index[id])
		}
	}
	return out, nil
}
