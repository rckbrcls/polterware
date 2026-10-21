package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/polter"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

const decisionUsage = `usage: polterware decision list [proposed|active|challenged|superseded]
       polterware decision show <verdict>
       polterware decision propose "<title>" [--trigger "..."] [--body "..."]
       polterware decision activate <verdict> [--reason "..."]
       polterware decision challenge <verdict> --reason "..."
       polterware decision supersede <verdict> (--by <verdict> | --title "<new title>") [--reason "..."]
       polterware decision trigger <verdict> "<review condition>"`

// runDecision reads the Verdict lifecycle and writes its transitions as Polter
// decision blocks through ApplyPolter, so the CLI, MCP, and Desktop share one
// path and one audit trail.
func runDecision(dbPath string, args []string) error {
	if len(args) == 0 {
		return errors.New(decisionUsage)
	}
	action, rest := args[0], args[1:]
	flags := flag.NewFlagSet("decision "+action, flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	reason := flags.String("reason", "", "why the decision moves")
	trigger := flags.String("trigger", "", "review trigger")
	body := flags.String("body", "", "Verdict text, plain (no # headings)")
	by := flags.String("by", "", "the decision that supersedes")
	title := flags.String("title", "", "title of a new superseding decision")
	agent := flags.String("agent", "", "agent label (default: $"+envAgentLabel+")")
	positional, err := parseInterspersed(flags, rest)
	if err != nil {
		return err
	}

	var input polter.DecisionInput
	var summary, rationale string
	need := func(n int) error {
		if len(positional) != n {
			return errors.New(decisionUsage)
		}
		return nil
	}
	switch action {
	case "list":
		if len(positional) > 1 || (len(positional) == 1 && !decision.ValidState(positional[0])) {
			return errors.New(decisionUsage)
		}
		return decisionQuery(dbPath, *projectID, strings.TrimSpace("decisions "+strings.Join(positional, " ")))
	case "show":
		if err := need(1); err != nil {
			return err
		}
		return decisionQuery(dbPath, *projectID, "decision "+positional[0])
	case "propose":
		if err := need(1); err != nil {
			return err
		}
		input = polter.DecisionInput{Ref: polter.DecisionNewRef, Title: positional[0], Trigger: *trigger, Body: *body}
		summary, rationale = "Propose decision "+positional[0], firstOr(*reason, "A new decision is proposed for review")
	case "activate":
		if err := need(1); err != nil {
			return err
		}
		input = polter.DecisionInput{Ref: positional[0], Status: decision.StateActive, Reason: *reason}
		summary, rationale = "Activate decision "+positional[0], firstOr(*reason, "The decision is accepted")
	case "challenge":
		if err := need(1); err != nil {
			return err
		}
		if strings.TrimSpace(*reason) == "" {
			return errors.New("decision challenge needs --reason")
		}
		input = polter.DecisionInput{Ref: positional[0], Status: decision.StateChallenged, Reason: *reason}
		summary, rationale = "Challenge decision "+positional[0], *reason
	case "supersede":
		if err := need(1); err != nil {
			return err
		}
		if (*by == "") == (*title == "") {
			return errors.New("decision supersede needs exactly one of --by <verdict> or --title \"<new title>\"")
		}
		if *by != "" {
			input = polter.DecisionInput{Ref: *by, Supersedes: positional[0], Reason: *reason}
		} else {
			input = polter.DecisionInput{Ref: polter.DecisionNewRef, Title: *title, Supersedes: positional[0], Trigger: *trigger, Body: *body, Reason: *reason}
		}
		summary, rationale = "Supersede decision "+positional[0], firstOr(*reason, "A newer decision replaces it")
	case "trigger":
		if err := need(2); err != nil {
			return err
		}
		input = polter.DecisionInput{Ref: positional[0], Trigger: positional[1]}
		summary, rationale = "Set review trigger on "+positional[0], "Record when the decision must be reviewed"
	default:
		return errors.New(decisionUsage)
	}

	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	holder := strings.TrimSpace(*agent)
	if holder == "" {
		holder = strings.TrimSpace(os.Getenv(envAgentLabel))
	}
	request := &localv1.ApplyPolterRequest{
		ProjectId: project.Id, Text: polter.ComposeDecision(input, summary, rationale), SessionLabel: holder,
	}
	if sessionID := os.Getenv(envSession); sessionID != "" {
		request.SessionId = sessionID
	}
	res, err := c.Work.ApplyPolter(context.Background(), connect.NewRequest(request))
	if diags, ok := polterDiagnostics(err); ok {
		// Line numbers point into generated text; print the messages only.
		for i := range diags {
			diags[i].Line = 0
		}
		printDiagnostics("decision", diags)
		return exitError{code: 1}
	}
	if err != nil {
		return err
	}
	if len(res.Msg.Ops) == 0 {
		fmt.Println("no changes")
		return nil
	}
	fmt.Println(strings.Join(res.Msg.Ops, "\n"))
	return nil
}

func decisionQuery(dbPath, projectID, query string) error {
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, projectID)
	if err != nil {
		return err
	}
	res, err := c.Work.QueryPolter(context.Background(), connect.NewRequest(&localv1.QueryPolterRequest{ProjectId: project.Id, Query: query}))
	if err != nil {
		return err
	}
	fmt.Print(res.Msg.Text)
	return nil
}

func firstOr(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}
