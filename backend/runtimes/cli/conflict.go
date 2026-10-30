package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/polter"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

const conflictUsage = `usage: polterware conflict raise <slug> "<request>" (--rule <slug> | --decision <Decision-0003>) [--card <slug>] [--option "<text>"]... [--project <id>]
       polterware conflict decide <slug> "<answer>" [--project <id>]
       polterware conflict wait <slug> [--timeout 30m] [--project <id>]
       polterware conflict withdraw <slug> [--project <id>]
       polterware conflict list [--project <id>]`

// repeated collects a flag given more than once.
type repeated []string

func (r *repeated) String() string     { return strings.Join(*r, ", ") }
func (r *repeated) Set(v string) error { *r = append(*r, v); return nil }

// runConflict raises, decides, waits on, withdraws, or lists Conflicts: a
// request that goes against a Rule or a Decision, decided by a person.
func runConflict(dbPath string, args []string) error {
	if len(args) == 0 {
		return errors.New(conflictUsage)
	}
	verb := args[0]
	flags := flag.NewFlagSet("conflict "+verb, flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	rule := flags.String("rule", "", "the Rule the request goes against (slug or id)")
	decisionRef := flags.String("decision", "", "the Decision the request goes against")
	card := flags.String("card", "", "the card the request is about")
	timeout := flags.Duration("timeout", 30*time.Minute, "how long wait blocks")
	var options repeated
	flags.Var(&options, "option", "an answer a person may pick (repeat it)")
	positional, err := parseInterspersed(flags, args[1:])
	if err != nil {
		return err
	}
	want := map[string]int{"raise": 2, "decide": 2, "wait": 1, "withdraw": 1, "list": 0}
	if n, ok := want[verb]; !ok || len(positional) != n {
		return errors.New(conflictUsage)
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	query := func(text string) (string, error) {
		res, err := c.Work.QueryPolter(context.Background(), connect.NewRequest(&localv1.QueryPolterRequest{ProjectId: project.Id, Query: text}))
		if err != nil {
			return "", err
		}
		return res.Msg.Text, nil
	}
	switch verb {
	case "list":
		text, err := query(polter.QueryConflicts)
		if err == nil {
			fmt.Print(text)
		}
		return err
	case "wait":
		deadline := time.Now().Add(*timeout)
		for {
			text, err := query(polter.QueryConflict + " " + positional[0])
			if err != nil {
				return err
			}
			if !strings.Contains(text, "\nstate: open\n") {
				fmt.Print(text)
				return nil
			}
			if time.Now().After(deadline) {
				fmt.Print(text)
				return fmt.Errorf("conflict %s is still open after %s", positional[0], *timeout)
			}
			time.Sleep(2 * time.Second)
		}
	case "decide":
		res, err := c.Work.ResolveInboxItem(context.Background(), connect.NewRequest(&localv1.ResolveInboxItemRequest{
			ProjectId: project.Id, ItemId: "conflict:" + positional[0], Action: "decide", Answer: positional[1],
			SessionLabel: os.Getenv(envAgentLabel),
		}))
		if err != nil {
			return err
		}
		fmt.Println(strings.Join(res.Msg.Ops, "\n"))
		return nil
	}

	var b strings.Builder
	b.WriteString("---\npolter: 1\n")
	if verb == "raise" {
		if *rule == "" && *decisionRef == "" {
			return errors.New("conflict raise needs --rule or --decision: the law the request goes against")
		}
		fmt.Fprintf(&b, "summary: Raise conflict %s\nrationale: The request goes against the project's law, so a person decides it\n---\n\n#### conflict %s: %s\n", positional[0], positional[0], positional[1])
		for _, pair := range [][2]string{{"rule", *rule}, {"decision", *decisionRef}, {"card", *card}} {
			if value := strings.TrimSpace(pair[1]); value != "" {
				fmt.Fprintf(&b, "%s: %s\n", pair[0], value)
			}
		}
		if len(options) > 0 {
			fmt.Fprintf(&b, "options: %s\n", strings.Join(options, " | "))
		}
	} else {
		fmt.Fprintf(&b, "summary: Withdraw conflict %s\nrationale: The request no longer needs a decision\n---\n\n#### conflict %s\nstatus: withdrawn\n", positional[0], positional[0])
	}
	request := &localv1.ApplyPolterRequest{ProjectId: project.Id, Text: b.String(), SessionLabel: os.Getenv(envAgentLabel)}
	if sessionID := os.Getenv(envSession); sessionID != "" {
		request.SessionId = sessionID
	}
	res, err := c.Work.ApplyPolter(context.Background(), connect.NewRequest(request))
	if diags, ok := polterDiagnostics(err); ok {
		for i := range diags {
			diags[i].Line = 0
		}
		printDiagnostics("conflict", diags)
		return exitError{code: 1}
	}
	if err != nil {
		return err
	}
	fmt.Println(strings.Join(res.Msg.Ops, "\n"))
	if verb == "raise" {
		fmt.Printf("raised: a person decides it in the Inbox; read the answer with polterware conflict wait %s\n", positional[0])
	}
	return nil
}
