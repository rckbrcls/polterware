package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/polter"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

const inboxUsage = `usage: polterware inbox [--scope <node>[,<node>]] [--exact] [--project <id>]
       polterware inbox <id> decide "<answer>" | delegate | link <slug#T2|sha> | reopen | defer | ignore [--agent name] [--project <id>]`

// runInbox lists the project's Inbox, or applies one action to one item.
func runInbox(dbPath string, args []string) error {
	flags := flag.NewFlagSet("inbox", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	agent := flags.String("agent", "", "agent label acting on the item (default: $"+envAgentLabel+")")
	scope := addScopeFlags(flags)
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) == 1 || len(positional) > 3 {
		return errors.New(inboxUsage)
	}
	var action string
	if len(positional) > 0 {
		if action, err = inbox.ParseAction(positional[1]); err != nil {
			return err
		}
		if (action == inbox.ActionDecide) != (len(positional) == 3) {
			return errors.New(inboxUsage)
		}
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	if len(positional) == 0 {
		res, err := c.Work.QueryPolter(context.Background(), connect.NewRequest(&localv1.QueryPolterRequest{ProjectId: project.Id, Query: polter.QueryInbox, ScopeNodes: scope.nodes(), ScopeExact: *scope.exact}))
		if err != nil {
			return err
		}
		fmt.Print(res.Msg.Text)
		return nil
	}
	label := strings.TrimSpace(*agent)
	if label == "" {
		label = strings.TrimSpace(os.Getenv(envAgentLabel))
	}
	request := &localv1.ResolveInboxItemRequest{ProjectId: project.Id, ItemId: positional[0], Action: action, SessionLabel: label}
	if len(positional) == 3 {
		request.Answer = positional[2]
	}
	res, err := c.Work.ResolveInboxItem(context.Background(), connect.NewRequest(request))
	if diags, ok := polterDiagnostics(err); ok {
		// Line numbers point into generated text; print the messages only.
		for i := range diags {
			diags[i].Line = 0
		}
		printDiagnostics("inbox", diags)
		return exitError{code: 1}
	}
	if err != nil {
		return err
	}
	fmt.Printf("%s %s: %s\n", inbox.ActionLabel(res.Msg.Action), res.Msg.Item.GetId(), res.Msg.Item.GetTitle())
	if len(res.Msg.Ops) > 0 {
		fmt.Println(strings.Join(res.Msg.Ops, "\n"))
	}
	for _, d := range res.Msg.Diagnostics {
		if d.Severity == polter.SeverityHint {
			fmt.Printf("hint: %s\n", d.Message)
		}
	}
	return nil
}
