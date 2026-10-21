package mcp

import (
	"errors"
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/polter"
)

// polterApply plans Polter text and, unless dry_run, applies it as one audited
// write. Without agent_run_id the write joins this MCP session's run.
func (s *Server) polterApply(args map[string]any) (string, error) {
	projectID := stringFrom(args["project_id"])
	if projectID == "" {
		return "", fmt.Errorf("project_id is required")
	}
	text := stringFrom(args["text"])
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("text is required: Polter format, see polter.format")
	}
	dryRun, _ := args["dry_run"].(bool)
	in := wedge.ApplyInput{
		ProjectID:  projectID,
		Text:       text,
		DryRun:     dryRun,
		Summary:    stringFrom(args["summary"]),
		Rationale:  stringFrom(args["rationale"]),
		AgentRunID: stringFrom(args["agent_run_id"]),
		Tool:       ToolPolterApply,
		Agent:      s.session.Label,
	}
	result, err := wedge.ApplyInSession(s.Store, &s.session, in)
	if err != nil {
		return "", polterError(result, err)
	}
	hints := ""
	if lines := diagnosticLines(result.Diagnostics); len(lines) > 0 {
		hints = strings.Join(lines, "\n") + "\n"
	}
	switch {
	case dryRun:
		return hints + polter.FormatPlan(result.Ops), nil
	case len(result.Ops) == 0:
		return hints + "no changes\n", nil
	default:
		return fmt.Sprintf("%sapplied %s (agent_run_id %s)\n", hints, polter.Summarize(result.Ops), result.AgentRunID), nil
	}
}

func (s *Server) polterQuery(args map[string]any) (string, error) {
	projectID := stringFrom(args["project_id"])
	if projectID == "" {
		return "", fmt.Errorf("project_id is required")
	}
	query := stringFrom(args["query"])
	if query == "" {
		query = polter.QueryCards
	}
	scope, err := wedge.ResolveScopeRef(s.Store, projectID, stringFrom(args["scope"]), boolFrom(args["scope_exact"]))
	if err != nil {
		return "", err
	}
	return wedge.QueryPolterScoped(s.Store, projectID, query, scope)
}

// polterError turns invalid text into one line per diagnostic, each with its fix.
func polterError(result wedge.ApplyResult, err error) error {
	if !errors.Is(err, wedge.ErrPolterInvalid) {
		return err
	}
	return errors.New(strings.Join(diagnosticLines(result.Diagnostics), "\n"))
}

// diagnosticLines renders one line per diagnostic; hints are marked so they
// read as advice, not failures.
func diagnosticLines(diags []polter.Diagnostic) []string {
	lines := make([]string, 0, len(diags))
	for _, d := range diags {
		message := d.Message
		if d.Severity == polter.SeverityHint {
			message = "hint: " + message
		}
		if d.Line > 0 {
			lines = append(lines, fmt.Sprintf("line %d: %s", d.Line, message))
		} else {
			lines = append(lines, message)
		}
	}
	return lines
}
