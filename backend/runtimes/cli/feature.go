package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/polter"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

const featureUsage = `usage: polterware feature new "<intent>" [--title "..."] [--under <node>]
       polterware feature shape <slug>
       polterware feature contract <slug> [--accept]
       polterware feature plan <slug> [--approve]`

// runFeature walks the new-feature flow: new writes a card in shape and
// prints its impact; shape, contract, and plan print a step, and --accept or
// --approve pass its gate.
func runFeature(dbPath string, args []string) error {
	if len(args) == 0 {
		return errors.New(featureUsage)
	}
	action, rest := args[0], args[1:]
	flags := flag.NewFlagSet("feature "+action, flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	var title, under *string
	var pass *bool
	switch action {
	case "new":
		title = flags.String("title", "", "card title (default: the intent's first sentence)")
		under = flags.String("under", "", "component path the feature lives under")
	case polter.FeatureStepContract:
		pass = flags.Bool("accept", false, "accept the contract and move the card to plan")
	case polter.FeatureStepPlan:
		pass = flags.Bool("approve", false, "approve the plan and move the card to build")
	case polter.FeatureStepShape:
	default:
		return errors.New(featureUsage)
	}
	positional, err := parseInterspersed(flags, rest)
	if err != nil {
		return err
	}
	if len(positional) != 1 || strings.TrimSpace(positional[0]) == "" {
		return errors.New(featureUsage)
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	ctx := context.Background()
	sessionID, label := os.Getenv(envSession), os.Getenv(envAgentLabel)

	slug, step := strings.TrimSpace(positional[0]), action
	switch {
	case action == "new":
		res, err := c.Work.CreateFeature(ctx, connect.NewRequest(&localv1.CreateFeatureRequest{
			ProjectId: project.Id, Intent: positional[0], Title: *title, Under: *under,
			SessionId: sessionID, SessionLabel: label,
		}))
		if diags, ok := polterDiagnostics(err); ok {
			printDiagnostics("feature", stripLines(diags))
			return exitError{code: 1}
		}
		if err != nil {
			return err
		}
		slug, step = res.Msg.Slug, polter.FeatureStepShape
		fmt.Printf("created %s\n", slug)
	case pass != nil && *pass:
		res, err := c.Work.AdvanceFeature(ctx, connect.NewRequest(&localv1.AdvanceFeatureRequest{
			ProjectId: project.Id, Slug: slug, Step: action,
			SessionId: sessionID, SessionLabel: label,
		}))
		if diags, ok := polterDiagnostics(err); ok {
			printDiagnostics("feature", stripLines(diags))
			return exitError{code: 1}
		}
		if err != nil {
			return err
		}
		fmt.Printf("%s moved to %s\n", slug, res.Msg.Stage)
		// Both gates land on the plan view: tasks to write, or tasks to build.
		step = polter.FeatureStepPlan
	}
	res, err := c.Work.QueryPolter(ctx, connect.NewRequest(&localv1.QueryPolterRequest{
		ProjectId: project.Id, Query: fmt.Sprintf("%s %s %s", polter.QueryFeature, slug, step),
	}))
	if err != nil {
		return err
	}
	fmt.Print(res.Msg.Text)
	return nil
}

// runVerify prints whether a card or task is finished and exits 1 when a
// check fails. It never writes.
func runVerify(dbPath string, args []string) error {
	// `verify run <id>` re-checks a delegated run; `verify --init` writes the checks file.
	if len(args) > 0 && args[0] == "run" {
		return runDispatch(dbPath, append([]string{"verify"}, args[1:]...))
	}
	if len(args) > 0 && args[0] == "--init" {
		return runDispatch(dbPath, append([]string{"verify"}, args...))
	}
	const verifyUsage = "usage: polterware verify <slug|slug#T2> [--project <id>]"
	flags := flag.NewFlagSet("verify", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	projectID := flags.String("project", "", "project id (default: project containing the cwd)")
	positional, err := parseInterspersed(flags, args)
	if err != nil {
		return err
	}
	if len(positional) == 0 || len(positional) > 2 {
		return errors.New(verifyUsage)
	}
	c, err := dial(dbPath)
	if err != nil {
		return err
	}
	project, err := resolveProject(c, *projectID)
	if err != nil {
		return err
	}
	res, err := c.Work.VerifyFeature(context.Background(), connect.NewRequest(&localv1.VerifyFeatureRequest{
		ProjectId: project.Id, Target: strings.Join(positional, " "),
	}))
	if err != nil {
		return err
	}
	result := polter.VerifyResult{Target: res.Msg.Target, Passed: res.Msg.Passed}
	for _, check := range res.Msg.Checks {
		result.Checks = append(result.Checks, polter.VerifyCheck{Status: check.Status, Message: check.Message})
	}
	fmt.Print(polter.EncodeVerify(result))
	if !result.Passed {
		return exitError{code: 1}
	}
	return nil
}

// stripLines drops line numbers that point into generated text.
func stripLines(diags []polter.Diagnostic) []polter.Diagnostic {
	for i := range diags {
		diags[i].Line = 0
	}
	return diags
}
