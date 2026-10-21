package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"connectrpc.com/connect"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"

	"github.com/polterware/polterware/backend/domains/agentaccess"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/platform/coreclient"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/platform/runstate"
)

const refreshInterval = 2 * time.Second

type section int

const (
	sectionCore section = iota
	sectionClients
	sectionHooks
	sectionRuns
	sectionCalls
	sectionHistory
	sectionCount
)

var (
	colorText    = lipgloss.AdaptiveColor{Dark: "#ececec", Light: "#1f1f1f"}
	colorSubtle  = lipgloss.AdaptiveColor{Dark: "#a4a4a4", Light: "#555555"}
	colorMuted   = lipgloss.AdaptiveColor{Dark: "#6f6f6f", Light: "#8a8a8a"}
	colorAccent  = lipgloss.AdaptiveColor{Dark: "#eef1f3", Light: "#2e2e2e"}
	colorSuccess = lipgloss.AdaptiveColor{Dark: "#01dd96", Light: "#0a8f63"}
	colorWarning = lipgloss.AdaptiveColor{Dark: "#d8a85d", Light: "#9a6a1c"}
	colorDanger  = lipgloss.AdaptiveColor{Dark: "#e46666", Light: "#b83a3a"}

	styleText    = lipgloss.NewStyle().Foreground(colorText)
	styleSubtle  = lipgloss.NewStyle().Foreground(colorSubtle)
	styleMuted   = lipgloss.NewStyle().Foreground(colorMuted)
	styleAccent  = lipgloss.NewStyle().Foreground(colorAccent)
	styleSuccess = lipgloss.NewStyle().Foreground(colorSuccess)
	styleWarning = lipgloss.NewStyle().Foreground(colorWarning)
	styleDanger  = lipgloss.NewStyle().Foreground(colorDanger)
	styleBrand   = lipgloss.NewStyle().Foreground(colorText).Bold(true)
	styleLabel   = lipgloss.NewStyle().Foreground(colorMuted).Width(10)
	styleFocus   = lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Width(10)
)

type clientState struct {
	client mcpClient
	status clientStatus
	err    error
	busy   bool
}

type snapshot struct {
	projects []projects.Project
	core     runstate.Core
	coreUp   bool
	sessions []mcpSession
	runs     []agentrun.Run
	calls    []agentaccess.ToolCall
	changes  []changeRow
	claims   []claimRow
	inbox    inboxCount
	hooks    []hookRow
	err      error
}

// hookRow is one plugin hook switch.
type hookRow struct {
	Name    string
	Label   string
	Enabled bool
}

// claimRow is one held task claim; inboxCount is the Inbox badge.
type claimRow struct {
	Agent string
	Ref   string
	Scope string
}

type inboxCount struct{ Open, Blocking int }

// mcpSession and changeRow are the TUI's views of core responses.
type mcpSession struct {
	ClientName    string
	ClientVersion string
	StartedAt     time.Time
}

type changeRow struct {
	ActorKind string
	Summary   string
	CreatedAt time.Time
}

type tickMsg time.Time
type snapshotMsg snapshot
type clientStatusMsg struct {
	index  int
	status clientStatus
	err    error
}
type actionMsg struct {
	text      string
	err       error
	projectID string
}

type tuiModel struct {
	dbPath  string
	coreBin string
	coreErr error
	cwd     string

	width, height int
	snap          snapshot
	projectID     string
	loaded        bool

	focus   section
	cursor  int
	offsets [sectionCount]int
	clients []clientState

	busy    string
	confirm string
	message string
	isError bool
}

func runTUI(dbPath string) error {
	cwd, _ := os.Getwd()
	coreBin, coreErr := coreclient.Executable()
	// The TUI reads through the core (Verdict 0007); start it once on launch. Later
	// refreshes never restart it, so stopping the core from the TUI sticks.
	if coreErr == nil {
		_, _ = coreclient.Ensure(dbPath)
	}
	m := &tuiModel{dbPath: dbPath, coreBin: coreBin, coreErr: coreErr, cwd: cwd}
	for _, client := range mcpClients() {
		m.clients = append(m.clients, clientState{client: client, busy: true})
	}
	_, err := tea.NewProgram(m, tea.WithAltScreen()).Run()
	return err
}

func (m *tuiModel) Init() tea.Cmd {
	return tea.Batch(m.loadSnapshot(), m.checkClients(), tick())
}

func tick() tea.Cmd {
	return tea.Tick(refreshInterval, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func (m *tuiModel) loadSnapshot() tea.Cmd {
	dbPath, projectID := m.dbPath, m.projectID
	return func() tea.Msg {
		var snap snapshot
		snap.core, snap.coreUp = runstate.ReadCore(dbPath)
		if !snap.coreUp {
			return snapshotMsg(snap)
		}
		c := coreclient.New(snap.core, "tui")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if res, err := c.AgentRuns.ListMcpSessions(ctx, connect.NewRequest(&localv1.ListMcpSessionsRequest{})); err == nil {
			for _, item := range res.Msg.Sessions {
				snap.sessions = append(snap.sessions, mcpSession{ClientName: item.ClientName, ClientVersion: item.ClientVersion, StartedAt: parseTime(item.StartedAt)})
			}
		}
		if res, err := c.AgentRuns.ListHookSwitches(ctx, connect.NewRequest(&localv1.ListHookSwitchesRequest{})); err == nil {
			for _, hook := range res.Msg.Hooks {
				snap.hooks = append(snap.hooks, hookRow{Name: hook.Name, Label: hook.Label, Enabled: hook.Enabled})
			}
		}
		list, err := c.Projects.ListProjects(ctx, connect.NewRequest(&localv1.ListProjectsRequest{}))
		if err != nil {
			snap.err = err
			return snapshotMsg(snap)
		}
		for _, item := range list.Msg.Projects {
			snap.projects = append(snap.projects, projects.Project{ID: item.Id, Name: item.Name, RootPath: item.RootPath, Status: item.Status, UpdatedAt: parseTime(item.UpdatedAt)})
		}
		if projectID == "" {
			return snapshotMsg(snap)
		}
		if res, err := c.AgentRuns.ListAgentRuns(ctx, connect.NewRequest(&localv1.ListAgentRunsRequest{ProjectId: projectID, Limit: 50})); err != nil {
			snap.err = err
		} else {
			for _, run := range res.Msg.Runs {
				snap.runs = append(snap.runs, agentrun.Run{ID: run.Id, ProjectID: run.ProjectId, Task: run.Task, AgentLabel: run.AgentLabel, Status: run.Status, ActorKind: run.ActorKind, CreatedAt: parseTime(run.CreatedAt)})
			}
		}
		if res, err := c.Work.ListAgentSessions(ctx, connect.NewRequest(&localv1.ListAgentSessionsRequest{ProjectId: projectID})); err == nil {
			for _, session := range res.Msg.Sessions {
				for _, claim := range session.Claims {
					snap.claims = append(snap.claims, claimRow{Agent: session.Agent, Ref: fmt.Sprintf("%s#T%d", claim.Slug, claim.Number), Scope: claim.Scope})
				}
			}
		}
		if res, err := c.Work.ListInbox(ctx, connect.NewRequest(&localv1.ListInboxRequest{ProjectId: projectID})); err == nil {
			snap.inbox = inboxCount{Open: int(res.Msg.OpenCount), Blocking: int(res.Msg.BlockingCount)}
		}
		if res, err := c.AgentRuns.ListChanges(ctx, connect.NewRequest(&localv1.ListChangesRequest{ProjectId: projectID, Limit: 50})); err != nil {
			snap.err = err
		} else {
			for _, change := range res.Msg.Changes {
				snap.changes = append(snap.changes, changeRow{ActorKind: change.ActorKind, Summary: change.Summary, CreatedAt: parseTime(change.CreatedAt)})
			}
		}
		if res, err := c.Context.ListAgentToolCalls(ctx, connect.NewRequest(&localv1.ListAgentToolCallsRequest{Limit: 200})); err != nil {
			snap.err = err
		} else {
			for _, call := range res.Msg.Calls {
				if call.ProjectId == projectID || call.ProjectId == "" {
					snap.calls = append(snap.calls, agentaccess.ToolCall{
						ID: call.Id, ProjectID: call.ProjectId, AgentRunID: call.AgentRunId, ToolName: call.ToolName,
						ArgumentsJSON: call.ArgumentsJson, ResultSummary: call.ResultSummary, OK: call.Ok, Source: call.Source,
						CreatedAt: parseTime(call.CreatedAt),
					})
				}
			}
		}
		return snapshotMsg(snap)
	}
}

func parseTime(value string) time.Time {
	parsed, _ := time.Parse(time.RFC3339, value)
	return parsed
}

func (m *tuiModel) checkClients() tea.Cmd {
	var cmds []tea.Cmd
	for i := range m.clients {
		cmds = append(cmds, m.checkClient(i))
	}
	return tea.Batch(cmds...)
}

func (m *tuiModel) checkClient(index int) tea.Cmd {
	m.clients[index].busy = true
	client, core, dbPath := m.clients[index].client, m.coreBin, m.dbPath
	return func() tea.Msg {
		if core == "" {
			return clientStatusMsg{index: index, status: clientUnknown}
		}
		status, err := client.status(core, dbPath)
		return clientStatusMsg{index: index, status: status, err: err}
	}
}

func (m *tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		return m, nil
	case tickMsg:
		return m, tea.Batch(m.loadSnapshot(), tick())
	case snapshotMsg:
		m.snap = snapshot(msg)
		m.loaded = true
		if m.projectID == "" || !m.hasProject(m.projectID) {
			if id := pickProject(m.snap.projects, m.cwd); id != "" {
				m.projectID = id
				return m, m.loadSnapshot()
			}
		}
		return m, nil
	case clientStatusMsg:
		state := &m.clients[msg.index]
		state.status, state.err, state.busy = msg.status, msg.err, false
		return m, nil
	case actionMsg:
		m.busy = ""
		if msg.projectID != "" {
			m.projectID = msg.projectID
		}
		m.setMessage(msg.text, msg.err)
		return m, tea.Batch(m.loadSnapshot(), m.checkClients())
	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m *tuiModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	key := msg.String()
	if key == "ctrl+c" {
		return m, tea.Quit
	}
	if m.confirm != "" {
		action := m.confirm
		m.confirm = ""
		if key == "y" || key == "Y" {
			return m, m.runAction(action)
		}
		m.setMessage("Cancelled.", nil)
		return m, nil
	}
	switch key {
	case "q":
		return m, tea.Quit
	case "tab":
		m.setFocus((m.focus + 1) % sectionCount)
	case "shift+tab":
		m.setFocus((m.focus + sectionCount - 1) % sectionCount)
	case "up", "k":
		m.setFocus(section(clamp(int(m.focus)-1, 0, int(sectionCount)-1)))
	case "down", "j":
		m.setFocus(section(clamp(int(m.focus)+1, 0, int(sectionCount)-1)))
	case "left", "h":
		m.move(-1)
	case "right", "l":
		m.move(1)
	case "r":
		m.setMessage("", nil)
		return m, tea.Batch(m.loadSnapshot(), m.checkClients())
	case "p":
		m.cycleProject()
		return m, m.loadSnapshot()
	case "s":
		return m, m.askCoreToggle()
	case "i":
		if m.busy != "" {
			return m, nil
		}
		for _, project := range m.snap.projects {
			if filepath.Clean(project.RootPath) == m.cwd {
				m.projectID = project.ID
				m.setMessage(fmt.Sprintf("%s is already registered as %s.", shortPath(m.cwd), project.Name), nil)
				return m, m.loadSnapshot()
			}
		}
		m.confirm = "init"
	case "enter", " ":
		switch m.focus {
		case sectionCore:
			return m, m.askCoreToggle()
		case sectionHooks:
			if m.busy != "" || m.cursor >= len(m.snap.hooks) {
				return m, nil
			}
			hook := m.snap.hooks[m.cursor]
			return m, m.runAction(fmt.Sprintf("hook:%s:%t", hook.Name, !hook.Enabled))
		case sectionClients:
			if m.busy != "" || m.coreBin == "" {
				return m, nil
			}
			state := m.clients[m.cursor]
			if state.busy || state.status == clientNotInstalled {
				return m, nil
			}
			m.confirm = "client:" + state.client.ID
		}
	}
	return m, nil
}

func (m *tuiModel) askCoreToggle() tea.Cmd {
	if m.busy != "" {
		return nil
	}
	if m.snap.coreUp {
		m.confirm = "core:stop"
		return nil
	}
	return m.runAction("core:start")
}

func (m *tuiModel) runAction(action string) tea.Cmd {
	dbPath, coreBin, cwd := m.dbPath, m.coreBin, m.cwd
	switch {
	case action == "core:start":
		if coreBin == "" {
			m.setMessage("", m.coreErr)
			return nil
		}
		m.busy = "Starting core…"
		return func() tea.Msg {
			core, err := coreclient.Ensure(dbPath)
			if err != nil {
				return actionMsg{err: err}
			}
			return actionMsg{text: fmt.Sprintf("Core running at %s.", core.Endpoint)}
		}
	case action == "core:stop":
		m.busy = "Stopping core…"
		return func() tea.Msg {
			if err := coreclient.Stop(dbPath); err != nil {
				return actionMsg{err: err}
			}
			return actionMsg{text: "Core stopped."}
		}
	case action == "init":
		m.busy = "Registering project…"
		return func() tea.Msg {
			c, err := coreclient.Connect(dbPath, "tui")
			if err != nil {
				return actionMsg{err: err}
			}
			ctx := context.Background()
			initRes, err := c.Projects.InitProject(ctx, connect.NewRequest(&localv1.InitProjectRequest{Name: filepath.Base(cwd), RootPath: cwd}))
			if err != nil {
				return actionMsg{err: err}
			}
			project := initRes.Msg.Project
			scanRes, err := c.Canon.ImportProjectSources(ctx, connect.NewRequest(&localv1.ImportProjectSourcesRequest{ProjectId: project.Id}))
			if err != nil {
				return actionMsg{err: err, projectID: project.Id}
			}
			return actionMsg{
				text:      fmt.Sprintf("Registered %s · %d facts, %d sources.", project.Name, scanRes.Msg.FactCount, scanRes.Msg.SourceCount),
				projectID: project.Id,
			}
		}
	case strings.HasPrefix(action, "hook:"):
		name, value, _ := strings.Cut(strings.TrimPrefix(action, "hook:"), ":")
		enabled := value == "true"
		m.busy = "Saving hook…"
		return func() tea.Msg {
			c, err := coreclient.Connect(dbPath, "tui")
			if err != nil {
				return actionMsg{err: err}
			}
			if _, err := c.AgentRuns.SetHookSwitch(context.Background(), connect.NewRequest(&localv1.SetHookSwitchRequest{Name: name, Enabled: enabled})); err != nil {
				return actionMsg{err: err}
			}
			return actionMsg{text: fmt.Sprintf("Hook %s %s.", name, map[bool]string{true: "on", false: "off"}[enabled])}
		}
	case strings.HasPrefix(action, "client:"):
		index := m.clientIndex(strings.TrimPrefix(action, "client:"))
		if index < 0 {
			return nil
		}
		state := &m.clients[index]
		state.busy = true
		client, configured := state.client, state.status == clientConfigured
		if configured {
			m.busy = "Removing from " + client.Name + "…"
		} else {
			m.busy = "Configuring " + client.Name + "…"
		}
		return func() tea.Msg {
			if configured {
				if err := client.remove(); err != nil {
					return actionMsg{err: err}
				}
				return actionMsg{text: "Removed Polterware from " + client.Name + "."}
			}
			if err := configureClient(client, coreBin, dbPath); err != nil {
				return actionMsg{err: err}
			}
			return actionMsg{text: client.Name + " will launch Polterware MCP in new sessions."}
		}
	}
	return nil
}

func (m *tuiModel) clientIndex(id string) int {
	for i, state := range m.clients {
		if state.client.ID == id {
			return i
		}
	}
	return -1
}

func (m *tuiModel) setMessage(text string, err error) {
	m.isError = err != nil
	if err != nil {
		text = err.Error()
	}
	m.message = text
}

func (m *tuiModel) hasProject(id string) bool {
	for _, project := range m.snap.projects {
		if project.ID == id {
			return true
		}
	}
	return false
}

func (m *tuiModel) cycleProject() {
	list := m.snap.projects
	if len(list) == 0 {
		return
	}
	next := 0
	for i, project := range list {
		if project.ID == m.projectID {
			next = (i + 1) % len(list)
		}
	}
	m.projectID = list[next].ID
	m.offsets = [sectionCount]int{}
}

// pickProject prefers the project whose root contains cwd, then the most recently updated.
func pickProject(list []projects.Project, cwd string) string {
	best, bestLen := "", -1
	for _, project := range list {
		root := filepath.Clean(project.RootPath)
		if project.RootPath != "" && (cwd == root || strings.HasPrefix(cwd, root+string(filepath.Separator))) && len(root) > bestLen {
			best, bestLen = project.ID, len(root)
		}
	}
	if best != "" {
		return best
	}
	var latest projects.Project
	for _, project := range list {
		if latest.ID == "" || project.UpdatedAt.After(latest.UpdatedAt) {
			latest = project
		}
	}
	return latest.ID
}

func (m *tuiModel) setFocus(s section) {
	if s != m.focus {
		m.focus = s
		m.cursor = 0
	}
}

func (m *tuiModel) move(delta int) {
	switch m.focus {
	case sectionClients:
		m.cursor = clamp(m.cursor+delta, 0, len(m.clients)-1)
	case sectionHooks:
		m.cursor = clamp(m.cursor+delta, 0, max(len(m.snap.hooks)-1, 0))
	case sectionRuns, sectionCalls, sectionHistory:
		limit := m.listLen(m.focus) - m.listRows()
		m.offsets[m.focus] = clamp(m.offsets[m.focus]+delta, 0, max(limit, 0))
	}
}

func (m *tuiModel) listLen(s section) int {
	switch s {
	case sectionRuns:
		return len(m.snap.runs)
	case sectionCalls:
		return len(m.snap.calls)
	case sectionHistory:
		return len(m.snap.changes)
	}
	return 0
}

func (m *tuiModel) listRows() int {
	sessions := max(len(m.snap.sessions), 1)
	fixed := 1 + 2 + 2 + 1 + 1 + sessions + 1 + 3*2 + 2 + m.workRowCount() + 1
	if m.showGhost() {
		fixed += ghostHeight - 1
	}
	rows := (m.height - fixed) / 3
	return clamp(rows, 2, 12)
}

func (m *tuiModel) View() string {
	if m.width == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(m.viewHeader())
	b.WriteString("\n\n")
	b.WriteString(m.viewCore())
	b.WriteString(m.viewClients())
	b.WriteString(m.viewHooks())
	b.WriteString("\n")
	b.WriteString(m.viewSessions())
	b.WriteString("\n")
	b.WriteString(m.viewWork())
	b.WriteString(m.viewInbox())
	b.WriteString(m.viewRuns())
	b.WriteString(m.viewCalls())
	b.WriteString(m.viewHistory())
	b.WriteString("\n")
	b.WriteString(m.viewFooter())
	return b.String()
}

func (m *tuiModel) line(s string) string {
	return ansi.Truncate(s, max(m.width-1, 10), "…") + "\n"
}

func (m *tuiModel) label(s section, text string) string {
	if m.focus == s {
		return styleFocus.Render(text)
	}
	return styleLabel.Render(text)
}

func (m *tuiModel) viewHeader() string {
	project := styleMuted.Render("no project")
	for _, item := range m.snap.projects {
		if item.ID == m.projectID {
			project = styleText.Render(item.Name) + styleMuted.Render(" "+item.ID)
		}
	}
	dot := styleMuted.Render(" · ")
	if !m.showGhost() {
		return m.line(styleBrand.Render("polterware") + dot + project + dot + styleMuted.Render(shortPath(m.dbPath)))
	}
	info := make([]string, ghostHeight)
	info[2] = styleBrand.Render("polterware")
	info[3] = project
	info[4] = styleMuted.Render(shortPath(m.dbPath))
	var b strings.Builder
	for i, ghost := range renderGhost() {
		b.WriteString(m.line(ghost + info[i]))
	}
	return b.String()
}

func (m *tuiModel) viewCore() string {
	var status string
	switch {
	case !m.loaded:
		status = styleMuted.Render("…")
	case m.snap.coreUp:
		core := m.snap.core
		status = styleSuccess.Render("● running") + "  " +
			styleSubtle.Render(fmt.Sprintf("pid %d  %s  up %s", core.PID, core.Endpoint, since(core.StartedAt)))
	default:
		status = styleMuted.Render("○ stopped")
		if m.coreErr != nil {
			status += "  " + styleWarning.Render(m.coreErr.Error())
		}
	}
	return m.line(m.label(sectionCore, "Core") + status)
}

func (m *tuiModel) viewClients() string {
	var parts []string
	for i, state := range m.clients {
		mark := styleMuted.Render("·")
		switch {
		case state.busy:
			mark = styleMuted.Render("…")
		case state.err != nil:
			mark = styleDanger.Render("!")
		case state.status == clientConfigured:
			mark = styleSuccess.Render("✓")
		case state.status == clientConfiguredOther:
			mark = styleWarning.Render("≠")
		case state.status == clientNotInstalled:
			mark = styleMuted.Render("–")
		}
		name := styleSubtle.Render(state.client.Name)
		if state.status == clientNotInstalled {
			name = styleMuted.Render(state.client.Name)
		}
		if m.focus == sectionClients && i == m.cursor {
			name = styleAccent.Underline(true).Render(state.client.Name)
		}
		parts = append(parts, name+" "+mark)
	}
	return m.line(m.label(sectionClients, "Clients") + strings.Join(parts, "   "))
}

func (m *tuiModel) viewHooks() string {
	if len(m.snap.hooks) == 0 {
		return m.line(m.label(sectionHooks, "Hooks") + styleMuted.Render("core stopped"))
	}
	parts := make([]string, 0, len(m.snap.hooks))
	for i, hook := range m.snap.hooks {
		mark := styleMuted.Render("○")
		if hook.Enabled {
			mark = styleSuccess.Render("●")
		}
		name := styleSubtle.Render(hook.Name)
		if m.focus == sectionHooks && i == m.cursor {
			name = styleAccent.Underline(true).Render(hook.Name)
		}
		parts = append(parts, name+" "+mark)
	}
	return m.line(m.label(sectionHooks, "Hooks") + strings.Join(parts, "   "))
}

func (m *tuiModel) viewSessions() string {
	label := styleLabel.Render("MCP")
	if len(m.snap.sessions) == 0 {
		return m.line(label + styleMuted.Render("no live sessions"))
	}
	last := ""
	for _, call := range m.snap.calls {
		if call.Source == "mcp" {
			last = fmt.Sprintf("  last %s %s ago", call.ToolName, since(call.CreatedAt))
			break
		}
	}
	var b strings.Builder
	for i, session := range m.snap.sessions {
		name := session.ClientName
		if name == "" {
			name = "unknown client"
		}
		if session.ClientVersion != "" {
			name += " " + session.ClientVersion
		}
		row := styleSuccess.Render("● ") + styleText.Render(name) +
			styleSubtle.Render(fmt.Sprintf("  up %s", since(session.StartedAt)))
		if i == len(m.snap.sessions)-1 {
			row += styleMuted.Render(last)
		}
		if i > 0 {
			label = styleLabel.Render("")
		}
		b.WriteString(m.line(label + row))
	}
	return b.String()
}

const maxClaimRows = 3

// workRowCount is how many lines viewWork prints.
func (m *tuiModel) workRowCount() int {
	n := min(len(m.snap.claims), maxClaimRows)
	if len(m.snap.claims) > maxClaimRows {
		n++
	}
	return max(n, 1)
}

// viewWork lists the active task claims, so a person sees who holds what.
func (m *tuiModel) viewWork() string {
	label := styleLabel.Render("Work")
	if len(m.snap.claims) == 0 {
		return m.line(label + styleMuted.Render(m.emptyText("no active claims")))
	}
	var b strings.Builder
	for i, claim := range m.snap.claims {
		if i == maxClaimRows {
			b.WriteString(m.line(styleLabel.Render("") + styleMuted.Render(fmt.Sprintf("+%d more", len(m.snap.claims)-maxClaimRows))))
			break
		}
		row := styleAccent.Render("◐ ") + styleText.Render(pad(claim.Ref, 28)) + " " + styleSubtle.Render(pad(claim.Agent, 12))
		if claim.Scope != "" {
			row += " " + styleMuted.Render(claim.Scope)
		}
		b.WriteString(m.line(label + row))
		label = styleLabel.Render("")
	}
	return b.String()
}

// viewInbox prints the same count the sidebar badge and `status` show.
func (m *tuiModel) viewInbox() string {
	label := styleLabel.Render("Inbox")
	if m.projectID == "" || m.snap.inbox.Open == 0 {
		return m.line(label + styleMuted.Render("clear"))
	}
	text := fmt.Sprintf("%d open", m.snap.inbox.Open)
	if m.snap.inbox.Blocking > 0 {
		return m.line(label + styleDanger.Render(fmt.Sprintf("%s · %d blocking", text, m.snap.inbox.Blocking)))
	}
	return m.line(label + styleWarning.Render(text))
}

func (m *tuiModel) viewList(s section, title, empty string, rows []string) string {
	var b strings.Builder
	label := m.label(s, title)
	if len(rows) == 0 {
		b.WriteString(m.line(label + styleMuted.Render(empty)))
		return b.String()
	}
	offset := clamp(m.offsets[s], 0, max(len(rows)-1, 0))
	end := min(offset+m.listRows(), len(rows))
	for i := offset; i < end; i++ {
		prefix := styleLabel.Render("")
		if i == offset {
			prefix = label
		}
		b.WriteString(m.line(prefix + rows[i]))
	}
	if more := len(rows) - end; more > 0 {
		b.WriteString(m.line(styleLabel.Render("") + styleMuted.Render(fmt.Sprintf("+%d more", more))))
	}
	return b.String()
}

func (m *tuiModel) viewRuns() string {
	var rows []string
	for _, run := range m.snap.runs {
		status := styleMuted.Render(pad(run.Status, 6))
		if run.Status == agentrun.StatusOpen {
			status = styleAccent.Render(pad(run.Status, 6))
		}
		who := run.AgentLabel
		if who == "" {
			who = run.ActorKind
		}
		rows = append(rows, status+" "+styleMuted.Render(pad(shortID(run.ID), 12))+" "+
			styleText.Render(pad(run.Task, 36))+" "+styleSubtle.Render(pad(who, 12))+" "+styleMuted.Render(since(run.CreatedAt)+" ago"))
	}
	return m.viewList(sectionRuns, "Runs", m.emptyText("no agent runs yet"), rows)
}

func (m *tuiModel) viewCalls() string {
	var rows []string
	for _, call := range m.snap.calls {
		mark := styleSuccess.Render("✓")
		if !call.OK {
			mark = styleDanger.Render("✗")
		}
		rows = append(rows, styleMuted.Render(clock(call.CreatedAt))+" "+mark+" "+
			styleText.Render(pad(call.ToolName, 18))+" "+styleMuted.Render(pad(shortID(call.AgentRunID), 12))+" "+
			styleSubtle.Render(oneLine(call.ResultSummary)))
	}
	return m.viewList(sectionCalls, "Calls", m.emptyText("no tool calls yet"), rows)
}

func (m *tuiModel) viewHistory() string {
	var rows []string
	for _, change := range m.snap.changes {
		actor := styleSubtle.Render(pad(change.ActorKind, 6))
		if change.ActorKind == agentrun.ActorKindAgent {
			actor = styleAccent.Render(pad(change.ActorKind, 6))
		}
		rows = append(rows, styleMuted.Render(clock(change.CreatedAt))+" "+actor+" "+styleText.Render(oneLine(change.Summary)))
	}
	return m.viewList(sectionHistory, "History", m.emptyText("no changes yet"), rows)
}

func (m *tuiModel) emptyText(text string) string {
	if m.projectID == "" {
		return "no project — press i to register " + shortPath(m.cwd)
	}
	return text
}

func (m *tuiModel) viewFooter() string {
	switch {
	case m.confirm != "":
		return m.line(styleWarning.Render(m.confirmText()) + styleMuted.Render("  y confirm · any key cancel"))
	case m.busy != "":
		return m.line(styleAccent.Render(m.busy))
	case m.message != "":
		style := styleSubtle
		if m.isError {
			style = styleDanger
		}
		return m.line(style.Render(m.message)) + m.line(m.keyHints())
	}
	return m.line(m.keyHints())
}

func (m *tuiModel) confirmText() string {
	switch {
	case m.confirm == "core:stop":
		return "Stop the standalone core?"
	case m.confirm == "init":
		return fmt.Sprintf("Register %s as a project and scan it?", shortPath(m.cwd))
	case strings.HasPrefix(m.confirm, "client:"):
		state := m.clients[m.clientIndex(strings.TrimPrefix(m.confirm, "client:"))]
		if state.status == clientConfigured {
			return "Remove Polterware from " + state.client.Name + "?"
		}
		return "Configure " + state.client.Name + " to launch " + shortPath(m.coreBin) + " mcp?"
	}
	return m.confirm
}

func (m *tuiModel) keyHints() string {
	hints := []string{"↑↓ section", "←→ item"}
	switch m.focus {
	case sectionCore:
		if m.snap.coreUp {
			hints = append(hints, "enter stop core")
		} else {
			hints = append(hints, "enter start core")
		}
	case sectionClients:
		hints = append(hints, "enter configure/remove")
	case sectionHooks:
		hints = append(hints, "enter turn on/off")
	}
	hints = append(hints, "p project", "i register cwd", "r refresh", "q quit")
	return styleMuted.Render(strings.Join(hints, " · "))
}

func pad(s string, width int) string {
	s = oneLine(s)
	if ansi.StringWidth(s) > width {
		return ansi.Truncate(s, width, "…")
	}
	return s + strings.Repeat(" ", width-ansi.StringWidth(s))
}

func oneLine(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func shortPath(path string) string {
	if home, err := os.UserHomeDir(); err == nil && strings.HasPrefix(path, home) {
		return "~" + strings.TrimPrefix(path, home)
	}
	return path
}

func clock(t time.Time) string {
	if t.IsZero() {
		return "--:--"
	}
	local := t.Local()
	if time.Since(local) > 24*time.Hour {
		return local.Format("Jan 02")
	}
	return local.Format("15:04 ")
}

func since(t time.Time) string {
	if t.IsZero() {
		return "?"
	}
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

func clamp(v, lo, hi int) int {
	if hi < lo {
		return lo
	}
	return min(max(v, lo), hi)
}
