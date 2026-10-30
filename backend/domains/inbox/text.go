package inbox

import (
	"fmt"
	"strings"
)

// statusBlockingLimit caps the blocking items `polterware status` prints.
const statusBlockingLimit = 5

// StatusLines is the Inbox part of `polterware status`: the count, the
// blocking items, and the items a person routed to agents. It is empty when
// nothing is waiting.
func StatusLines(r Result) string {
	var b strings.Builder
	if open := r.Open(); open > 0 {
		fmt.Fprintf(&b, "inbox: %d open (%d blocking)\n", open, r.Blocking())
		shown := 0
		for _, item := range r.Items {
			if item.State != StateOpen || !item.Blocking {
				continue
			}
			if shown == statusBlockingLimit {
				b.WriteString("! … more in polterware inbox\n")
				break
			}
			fmt.Fprintf(&b, "! %s %s %s%s\n", item.ID, item.Kind, item.Title, where(item))
			shown++
		}
	}
	for _, routed := range r.Routed {
		item := routed.Item
		switch routed.Action {
		case ActionDelegate:
			fmt.Fprintf(&b, "delegated: %s%s: choose a default and record it with `? %s -> answer`\n", item.Title, where(item), item.QuestionText)
		}
	}
	return b.String()
}

// List renders `polterware inbox`: one line per item, open first, then the
// deferred ones.
func List(r Result) string {
	if len(r.Items) == 0 {
		return "inbox empty\n"
	}
	width := 0
	for _, item := range r.Items {
		width = max(width, len(item.Kind))
	}
	var b strings.Builder
	deferred := false
	for _, item := range r.Items {
		if item.State == StateDeferred && !deferred {
			b.WriteString("deferred:\n")
			deferred = true
		}
		mark := " "
		if item.Blocking && item.State == StateOpen {
			mark = "!"
		}
		title := item.Title
		if len(item.Options) > 0 {
			title += " (" + strings.Join(item.Options, " | ") + ")"
		}
		fmt.Fprintf(&b, "%s %s %-*s  %s%s\n", item.ID, mark, width, item.Kind, title, where(item))
	}
	return b.String()
}

func where(item Item) string {
	if item.Where == "" {
		return ""
	}
	return "  " + item.Where
}
