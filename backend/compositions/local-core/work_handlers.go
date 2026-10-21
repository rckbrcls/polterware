package localcore

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/atlas"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
)

func (core *Core) ListWorkCards(_ context.Context, request *connect.Request[localv1.ListWorkCardsRequest]) (*connect.Response[localv1.ListWorkCardsResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	snapshot, err := core.Store.LoadWorkSnapshot(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	resolved, err := wedge.LoadNodeScope(core.Store, request.Msg.ProjectId, request.Msg.ScopeNode, request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	cards := make([]*localv1.WorkCard, 0, len(snapshot.Cards))
	for _, card := range wedge.FilterCardsByScope(resolved, snapshot.Cards) {
		if card.Status == work.CardActive {
			cards = append(cards, workCardProto(card))
		}
	}
	return connect.NewResponse(&localv1.ListWorkCardsResponse{Cards: cards}), nil
}

func (core *Core) ListAtlas(ctx context.Context, request *connect.Request[localv1.ListAtlasRequest]) (*connect.Response[localv1.ListAtlasResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	if point := strings.TrimSpace(request.Msg.AsOf); point != "" {
		rows, err := wedge.AtlasAt(ctx, core.Store, request.Msg.ProjectId, point)
		if err != nil {
			return nil, invalid(err.Error())
		}
		nodes := make([]*localv1.AtlasNode, 0, len(rows))
		for _, row := range rows {
			node := atlasNodeProto(row)
			node.Status = atlas.StatusProposed
			nodes = append(nodes, node)
		}
		return connect.NewResponse(&localv1.ListAtlasResponse{Nodes: nodes, Historical: true}), nil
	}
	snapshot, err := core.Store.LoadWorkSnapshot(request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	rows := wedge.AtlasRows(core.Store, snapshot)
	nodes := make([]*localv1.AtlasNode, 0, len(rows))
	for _, row := range rows {
		nodes = append(nodes, atlasNodeProto(row))
	}
	return connect.NewResponse(&localv1.ListAtlasResponse{
		Nodes: nodes, DriftSlugs: wedge.DriftSlugs(core.Store, request.Msg.ProjectId),
	}), nil
}

func (core *Core) ListAtlasHistory(_ context.Context, request *connect.Request[localv1.ListAtlasHistoryRequest]) (*connect.Response[localv1.ListAtlasHistoryResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	entries, err := wedge.AtlasHistory(core.Store, request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.AtlasHistoryEntry, 0, len(entries))
	for _, entry := range entries {
		out = append(out, &localv1.AtlasHistoryEntry{
			BatchId: entry.BatchID, At: entry.At.UTC().Format(time.RFC3339), AgentRunId: entry.AgentRunID,
			NodeOps: int32(entry.NodeOps), Summary: entry.Summary,
		})
	}
	return connect.NewResponse(&localv1.ListAtlasHistoryResponse{Entries: out}), nil
}

func (core *Core) ListAgentSessions(_ context.Context, request *connect.Request[localv1.ListAgentSessionsRequest]) (*connect.Response[localv1.ListAgentSessionsResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	sessions, handoffs, branch, err := wedge.AgentSessions(core.Store, request.Msg.ProjectId)
	if err != nil {
		return nil, internal(err)
	}
	res := &localv1.ListAgentSessionsResponse{Branch: branch}
	for _, session := range sessions {
		out := &localv1.AgentSession{RunId: session.RunID, Agent: session.Agent, Task: session.Task}
		if !session.StartedAt.IsZero() {
			out.StartedAt = session.StartedAt.UTC().Format(time.RFC3339)
		}
		for _, claim := range session.Claims {
			out.Claims = append(out.Claims, &localv1.SessionClaim{
				Slug: claim.Slug, Number: int32(claim.Number), Title: claim.Title, Scope: claim.Scope,
			})
		}
		res.Sessions = append(res.Sessions, out)
	}
	for _, h := range handoffs {
		res.Handoffs = append(res.Handoffs, &localv1.SessionHandoff{
			Slug: h.Slug, Branch: h.Branch, Goal: h.Goal, Done: h.Done, InProgress: h.InProgress,
			Next: h.Next, Agent: h.Agent, At: h.At.UTC().Format(time.RFC3339),
		})
	}
	return connect.NewResponse(res), nil
}

func (core *Core) LintPolter(_ context.Context, request *connect.Request[localv1.LintPolterRequest]) (*connect.Response[localv1.LintPolterResponse], error) {
	// Without a project only syntax is checked.
	var refs *polter.References
	if id := request.Msg.ProjectId; id != "" {
		var err error
		if refs, err = wedge.PolterReferences(core.Store, id); err != nil {
			return nil, internal(err)
		}
	}
	_, diags := polter.Lint(request.Msg.Text, refs)
	return connect.NewResponse(&localv1.LintPolterResponse{Diagnostics: diagnosticsProto(diags)}), nil
}

func (core *Core) QueryPolter(_ context.Context, request *connect.Request[localv1.QueryPolterRequest]) (*connect.Response[localv1.QueryPolterResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	scope, err := wedge.ResolveScopeRef(core.Store, request.Msg.ProjectId, request.Msg.ScopeNode, request.Msg.ScopeExact)
	if err != nil {
		return nil, invalid(err.Error())
	}
	text, err := wedge.QueryPolterScoped(core.Store, request.Msg.ProjectId, request.Msg.Query, scope)
	if err != nil {
		return nil, invalid(err.Error())
	}
	return connect.NewResponse(&localv1.QueryPolterResponse{Text: text}), nil
}

func (core *Core) EndSession(_ context.Context, request *connect.Request[localv1.EndSessionRequest]) (*connect.Response[localv1.EndSessionResponse], error) {
	session := core.sessions.end(request.Msg.SessionId)
	if session == nil {
		return connect.NewResponse(&localv1.EndSessionResponse{}), nil
	}
	count := len(session.Runs)
	session.Close(core.Store)
	return connect.NewResponse(&localv1.EndSessionResponse{CompletedRuns: int32(count)}), nil
}

// invalidPolter is InvalidArgument with the line-numbered diagnostics as an
// ApplyPolterResponse error detail, so clients can print them one per line.
func invalidPolter(diags []polter.Diagnostic) error {
	err := invalid(diagnosticsMessage(diags))
	var connectErr *connect.Error
	if errors.As(err, &connectErr) {
		if detail, detailErr := connect.NewErrorDetail(&localv1.ApplyPolterResponse{Diagnostics: diagnosticsProto(diags)}); detailErr == nil {
			connectErr.AddDetail(detail)
		}
	}
	return err
}

func diagnosticsProto(diags []polter.Diagnostic) []*localv1.PolterDiagnostic {
	out := make([]*localv1.PolterDiagnostic, 0, len(diags))
	for _, d := range diags {
		out = append(out, &localv1.PolterDiagnostic{Line: int32(d.Line), Severity: d.Severity, Message: d.Message})
	}
	return out
}

func (core *Core) ApplyPolter(_ context.Context, request *connect.Request[localv1.ApplyPolterRequest]) (*connect.Response[localv1.ApplyPolterResponse], error) {
	msg := request.Msg
	if msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	change := msg.GetChange()
	in := wedge.ApplyInput{
		ProjectID:  msg.ProjectId,
		Text:       msg.Text,
		DryRun:     msg.DryRun,
		Summary:    change.GetSummary(),
		Rationale:  change.GetRationale(),
		AgentRunID: change.GetAgentRunId(),
	}
	result, err := core.applyAs(clientOf(request.Header()), msg.SessionId, msg.SessionLabel, "desktop.work.apply", in)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(applyResponse(result)), nil
}

// applyAs applies Polter text for a client: the Desktop writes as a human
// under desktopTool and never claims; agent clients (the CLI) write as an
// agent, join their session run when session_id is set, and otherwise open a
// run labelled with the client. Errors are already Connect errors.
func (core *Core) applyAs(client, sessionID, sessionLabel, desktopTool string, in wedge.ApplyInput) (wedge.ApplyResult, error) {
	if client == "desktop" {
		// The Desktop never claims: coordination lines have no agent.
		in.ActorKind = agentrun.ActorKindHuman
		in.Tool = desktopTool
	} else {
		in.Agent = strings.TrimSpace(sessionLabel)
		in.AutoStartLabel = client
	}
	var result wedge.ApplyResult
	var err error
	if sessionID != "" && client != "desktop" {
		err = core.sessions.apply(sessionID, sessionLabel, func(session *wedge.SessionRuns) error {
			var applyErr error
			in.AutoStartLabel = ""
			result, applyErr = wedge.ApplyInSession(core.Store, session, in)
			return applyErr
		})
	} else {
		result, err = wedge.ApplyPolter(core.Store, in)
	}
	if errors.Is(err, wedge.ErrPolterInvalid) {
		return result, invalidPolter(result.Diagnostics)
	}
	if err != nil {
		return result, mapAuditedErr(err)
	}
	return result, nil
}

func (core *Core) WriteHandoff(_ context.Context, request *connect.Request[localv1.WriteHandoffRequest]) (*connect.Response[localv1.WriteHandoffResponse], error) {
	msg := request.Msg
	if msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	change := msg.GetChange()
	agent := strings.TrimSpace(msg.Agent)
	if agent == "" {
		agent = strings.TrimSpace(msg.SessionLabel)
	}
	in := wedge.HandoffInput{
		ProjectID: msg.ProjectId,
		CardSlug:  msg.CardSlug,
		Note:      msg.Note,
		Agent:     agent,
		Summary:   change.GetSummary(),
		Rationale: change.GetRationale(),
	}
	in.Apply.AgentRunID = change.GetAgentRunId()
	client := clientOf(request.Header())
	if client == "desktop" {
		in.Apply.ActorKind = agentrun.ActorKindHuman
		in.Apply.Tool = "desktop.work.handoff"
	} else {
		in.Apply.AutoStartLabel = client
		in.Apply.Tool = "polter.handoff"
	}
	applyIn, hints, err := wedge.ComposeHandoff(core.Store, in)
	if err != nil {
		return nil, invalid(err.Error())
	}
	var result wedge.ApplyResult
	if msg.SessionId != "" && client != "desktop" {
		err = core.sessions.apply(msg.SessionId, msg.SessionLabel, func(session *wedge.SessionRuns) error {
			var applyErr error
			applyIn.AutoStartLabel = ""
			result, applyErr = wedge.ApplyInSession(core.Store, session, applyIn)
			return applyErr
		})
	} else {
		result, err = wedge.ApplyPolter(core.Store, applyIn)
	}
	result.Diagnostics = append(hints, result.Diagnostics...)
	if errors.Is(err, wedge.ErrPolterInvalid) {
		return nil, invalidPolter(result.Diagnostics)
	}
	if err != nil {
		return nil, mapAuditedErr(err)
	}
	applied := applyResponse(result)
	return connect.NewResponse(&localv1.WriteHandoffResponse{
		Applied:     applied.Applied,
		Ops:         applied.Ops,
		Summary:     applied.Summary,
		Diagnostics: applied.Diagnostics,
		AgentRunId:  applied.AgentRunId,
		BatchId:     applied.BatchId,
	}), nil
}

func applyResponse(result wedge.ApplyResult) *localv1.ApplyPolterResponse {
	response := &localv1.ApplyPolterResponse{
		Applied:    result.Applied,
		AgentRunId: result.AgentRunID,
		BatchId:    result.BatchID,
	}
	if len(result.Ops) > 0 {
		response.Ops = strings.Split(strings.TrimSuffix(polter.FormatPlan(result.Ops), "\n"), "\n")
		response.Summary = polter.Summarize(result.Ops)
	}
	response.Diagnostics = diagnosticsProto(result.Diagnostics)
	return response
}

// diagnosticsMessage joins error diagnostics into one line-numbered message.
func diagnosticsMessage(diags []polter.Diagnostic) string {
	var lines []string
	for _, d := range diags {
		if d.Severity == polter.SeverityError {
			lines = append(lines, fmt.Sprintf("line %d: %s", d.Line, d.Message))
		}
	}
	if len(lines) == 0 {
		return wedge.ErrPolterInvalid.Error()
	}
	return strings.Join(lines, "; ")
}

func atlasNodeProto(row atlas.Row) *localv1.AtlasNode {
	out := &localv1.AtlasNode{
		Id:            row.ID,
		ParentId:      row.ParentID,
		Level:         row.Level,
		Slug:          row.Slug,
		Path:          row.Path,
		Title:         row.Title,
		Intent:        row.Intent,
		Decisions:     row.Decisions,
		Status:        row.Derived,
		ChildCount:    int32(row.ChildCount),
		FeatureCount:  int32(row.FeatureCount),
		OpenQuestions: int32(row.OpenQuestions),
		Repo:          row.Repo,
		Folder:        row.Folder,
		MigrationFrom: row.MigrationFrom,
		MigrationTo:   row.MigrationTo,
		Uses:          row.Uses,
	}
	for _, inv := range row.Invariants {
		if inv.State == work.InvariantRemoved {
			continue
		}
		out.Invariants = append(out.Invariants, &localv1.AtlasInvariant{Id: inv.ID, Text: inv.Text})
	}
	return out
}

func workCardProto(card work.Card) *localv1.WorkCard {
	out := &localv1.WorkCard{
		Id:        card.ID,
		ProjectId: card.ProjectID,
		Slug:      card.Slug,
		Title:     card.Title,
		Intent:    card.Intent,
		Stage:     card.Stage,
		Owner:     card.Owner,
		Under:     card.Under,
		Kind:      card.Kind,
		Decisions: card.Decisions,
		CreatedAt: card.CreatedAt.Format(time.RFC3339),
		UpdatedAt: card.UpdatedAt.Format(time.RFC3339),
	}
	for _, task := range card.Tasks {
		// The Board shows the scope with its checkout, as a claim stores it.
		row := &localv1.WorkTask{Id: task.ID, Number: int32(task.Number), Title: task.Title, State: task.State, Scope: work.QualifyScope(task.Repo, task.Scope)}
		if task.Claim != nil {
			row.ClaimHolder = task.Claim.Holder
		}
		out.Tasks = append(out.Tasks, row)
	}
	for _, q := range card.Questions {
		if q.State != work.QuestionRemoved {
			out.Questions = append(out.Questions, &localv1.WorkQuestion{Id: q.ID, Text: q.Text, Blocking: q.Blocking, Options: q.Options, State: q.State, Answer: q.Answer})
		}
	}
	for _, inv := range card.Invariants {
		if inv.State == work.InvariantActive {
			out.Invariants = append(out.Invariants, &localv1.WorkInvariant{Id: inv.ID, Text: inv.Text})
		}
	}
	return out
}

func (core *Core) ExportProjections(_ context.Context, request *connect.Request[localv1.ExportProjectionsRequest]) (*connect.Response[localv1.ExportProjectionsResponse], error) {
	if request.Msg.ProjectId == "" {
		return nil, invalid("project id is required")
	}
	files, err := wedge.ExportProjections(core.Store, request.Msg.ProjectId, request.Msg.DryRun)
	if err != nil {
		return nil, internal(err)
	}
	out := make([]*localv1.ProjectionFile, 0, len(files))
	for _, file := range files {
		out = append(out, &localv1.ProjectionFile{Repo: file.Repo, Path: file.Path, Action: file.Action, Reason: file.Reason})
	}
	return connect.NewResponse(&localv1.ExportProjectionsResponse{Files: out}), nil
}
