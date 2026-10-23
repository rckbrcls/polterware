package mcp

import (
	"strings"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/attachments"
	"github.com/polterware/polterware/notes/backend/domains/note"
	"github.com/polterware/polterware/notes/backend/domains/place"
	"github.com/polterware/polterware/notes/backend/domains/schedule"
	"github.com/polterware/polterware/notes/backend/domains/space"
	"github.com/polterware/polterware/notes/backend/domains/tag"
)

func noteSummary(item note.Summary, spaceName string, tagNames []string) map[string]any {
	out := map[string]any{"id": item.ID, "title": item.Title, "status": item.Status, "rev": item.Rev}
	if item.SpaceID != nil {
		out["spaceId"] = *item.SpaceID
	}
	if spaceName != "" {
		out["space"] = spaceName
	}
	if due := formatDue(item.DueAt, item.DueAllDay); due != "" {
		out["due"] = due
	}
	if item.Pinned {
		out["pinned"] = true
	}
	if len(tagNames) > 0 {
		out["tags"] = tagNames
	}
	if item.ScheduleLabel != "" {
		out["schedule"] = item.ScheduleLabel
	}
	if item.Snippet != "" {
		out["snippet"] = clipSnippet(item.Snippet)
	}
	return out
}

func noteJSON(m note.Note, checklist []note.CheckItem, tagNames []string, sched *schedule.Schedule, rule schedule.Rule, p *place.Place, files []attachments.Attachment, completions []note.Completion) map[string]any {
	out := map[string]any{"id": m.ID, "title": m.Title, "status": m.Status, "rev": m.Rev}
	if m.SpaceID != nil {
		out["spaceId"] = *m.SpaceID
	}
	if m.Content != "" {
		out["content"] = m.Content
	}
	if m.Pinned {
		out["pinned"] = true
	}
	if due := formatDue(m.DueAt, m.DueAllDay); due != "" {
		out["due"] = due
	}
	if len(checklist) > 0 {
		items := make([]map[string]any, 0, len(checklist))
		for _, item := range checklist {
			row := map[string]any{"id": item.ID, "title": item.Title, "done": item.Done}
			if item.Detail != "" {
				row["detail"] = item.Detail
			}
			items = append(items, row)
		}
		out["checklist"] = items
	}
	if len(tagNames) > 0 {
		out["tags"] = tagNames
	}
	if sched != nil {
		row := map[string]any{"tz": sched.TZ, "allDay": sched.AllDay}
		if label := scheduleLabel(rule); label != "" {
			row["label"] = label
		}
		if sched.Freq != "" {
			row["freq"] = string(sched.Freq)
			row["every"] = sched.Every
		}
		out["schedule"] = row
	}
	if p != nil {
		row := map[string]any{"lat": p.Lat, "lng": p.Lng}
		if p.Name != nil && *p.Name != "" {
			row["name"] = *p.Name
		}
		out["place"] = row
	}
	if len(files) > 0 {
		rows := make([]map[string]any, 0, len(files))
		for _, file := range files {
			row := map[string]any{"id": file.ID, "kind": file.Kind}
			if file.Title != nil && *file.Title != "" {
				row["title"] = *file.Title
			}
			if file.Name != nil && *file.Name != "" {
				row["name"] = *file.Name
			}
			if file.URL != nil {
				row["url"] = *file.URL
			}
			rows = append(rows, row)
		}
		out["attachments"] = rows
	}
	if len(completions) > 0 {
		rows := make([]string, 0, len(completions))
		for _, c := range completions {
			rows = append(rows, c.OccurrenceAt.UTC().Format(time.RFC3339))
		}
		out["completions"] = rows
	}
	return out
}

func spaceJSON(m space.Space) map[string]any {
	out := map[string]any{"id": m.ID, "name": m.Name, "rev": m.Rev}
	if m.ParentID != nil {
		out["parentId"] = *m.ParentID
	}
	if m.Color != nil {
		out["color"] = *m.Color
	}
	if m.Icon != nil {
		out["icon"] = *m.Icon
	}
	return out
}

func tagJSON(t tag.Tag) map[string]any {
	out := map[string]any{"name": t.Name, "count": t.UsageCount}
	if t.Color != nil {
		out["color"] = *t.Color
	}
	out["id"] = t.ID
	return out
}

func activityJSON(e activity.Event) map[string]any {
	return map[string]any{"at": e.At.UTC().Format(time.RFC3339), "actor": e.Actor, "entity": e.Entity, "id": e.EntityID, "op": e.Op, "summary": e.Summary}
}

func spaceTreeText(nodes []space.Space, parent *string) string {
	children := map[string][]space.Space{}
	roots := []space.Space{}
	for _, node := range nodes {
		if parent != nil {
			if node.ParentID != nil && *node.ParentID == *parent {
				roots = append(roots, node)
			}
			continue
		}
		if node.ParentID == nil {
			roots = append(roots, node)
		} else {
			children[*node.ParentID] = append(children[*node.ParentID], node)
		}
	}
	if parent != nil {
		return joinSpaces(roots, children)
	}
	return joinSpaces(roots, children)
}

func joinSpaces(nodes []space.Space, children map[string][]space.Space) string {
	parts := make([]string, 0, len(nodes))
	for _, node := range nodes {
		label := node.Name + "(" + node.ID + ")"
		if kids := children[node.ID]; len(kids) > 0 {
			label += " > " + joinSpaces(kids, children)
		}
		parts = append(parts, label)
	}
	return strings.Join(parts, ", ")
}
