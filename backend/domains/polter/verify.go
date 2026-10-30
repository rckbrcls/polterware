package polter

import (
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/work"
)

// Verify check statuses. Only fail makes the result fail; manual lines are
// contract items a person or agent confirms by hand.
const (
	VerifyPass   = "pass"
	VerifyFail   = "fail"
	VerifyInfo   = "info"
	VerifyManual = "manual"
)

// VerifyInput is what verify reads for one card, or one task when Task > 0.
type VerifyInput struct {
	Card work.Card
	Task int
	// Delivered is true when HEAD is an ancestor of local main or master.
	Delivered bool
	// Contract is the card's own and inherited invariants.
	Contract []ReviewInvariant
}

type VerifyCheck struct {
	Status  string
	Message string
}

type VerifyResult struct {
	Target string
	Passed bool
	Checks []VerifyCheck
}

// VerifyFeature reports whether a card (or one task) is finished: tasks done
// or dropped, no blocking question open. It is a
// read; it never moves the stored stage.
func VerifyFeature(in VerifyInput) (VerifyResult, error) {
	card := in.Card
	result := VerifyResult{Target: card.Slug}
	add := func(status, format string, args ...any) {
		result.Checks = append(result.Checks, VerifyCheck{Status: status, Message: fmt.Sprintf(format, args...)})
	}

	tasks := card.Tasks
	if in.Task > 0 {
		result.Target = fmt.Sprintf("%s#T%d", card.Slug, in.Task)
		tasks = nil
		for _, task := range card.Tasks {
			if task.Number == in.Task {
				tasks = append(tasks, task)
			}
		}
		if len(tasks) == 0 {
			return result, fmt.Errorf("card %s has no task T%d", card.Slug, in.Task)
		}
	} else if len(tasks) == 0 {
		add(VerifyFail, "no tasks: plan the feature before verifying it")
	}
	for _, task := range tasks {
		switch task.State {
		case work.TaskOpen:
			add(VerifyFail, "T%d is open: %s", task.Number, task.Title)
		case work.TaskDropped:
			add(VerifyInfo, "T%d dropped: %s", task.Number, task.Title)
		case work.TaskDone:
			add(VerifyPass, "T%d done: %s", task.Number, task.Title)
		}
	}

	if in.Task == 0 {
		for _, q := range card.Questions {
			if q.State != work.QuestionOpen {
				continue
			}
			if q.Blocking {
				add(VerifyFail, "blocking question open: %q", q.Text)
			} else {
				add(VerifyInfo, "question open: %q", q.Text)
			}
		}
	}
	for _, inv := range in.Contract {
		from := ""
		if inv.From != "" && inv.From != "card" {
			from = " (from " + inv.From + ")"
		}
		add(VerifyManual, "! %s%s", inv.Text, from)
	}
	if in.Delivered {
		add(VerifyInfo, "Git: HEAD is on main")
	} else {
		add(VerifyInfo, "Git: HEAD is not on main yet; the stored stage stays %s", card.Stage)
	}

	result.Passed = true
	for _, check := range result.Checks {
		if check.Status == VerifyFail {
			result.Passed = false
		}
	}
	return result, nil
}

// EncodeVerify renders one line per check under a pass or fail heading.
func EncodeVerify(result VerifyResult) string {
	var b strings.Builder
	decision := "PASS"
	if !result.Passed {
		decision = "FAIL"
	}
	fmt.Fprintf(&b, "verify %s  %s\n", result.Target, decision)
	for _, check := range result.Checks {
		label := check.Status
		if label == VerifyManual {
			label = "check"
		}
		fmt.Fprintf(&b, "%-5s %s\n", label, check.Message)
	}
	return b.String()
}
