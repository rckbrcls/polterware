package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/polterware/polterware/backend/domains/dispatch"
	"github.com/polterware/polterware/backend/platform/coreclient"
	"github.com/polterware/polterware/backend/platform/runstate"
)

type dispatchSnap struct {
	runs []dispatch.Run
	err  error
}

type dispatchState struct {
	open    bool
	loading bool
	runID   string
	run     *dispatch.Run
	err     error
}

type dispatchRunMsg struct {
	run dispatch.Run
	err error
}

func loadDispatchSnap(ctx context.Context, c coreclient.Clients, projectID string) dispatchSnap {
	runs, err := newDispatchClient(c).ListRuns(ctx, dispatchListRunsRequest{
		ProjectID: projectID,
		Limit:     50,
	})
	return dispatchSnap{runs: runs, err: err}
}

func (m *tuiModel) moveDispatch(delta int) {
	n := len(m.snap.dispatch.runs)
	if n == 0 {
		m.cursor = 0
		return
	}
	m.cursor = clamp(m.cursor+delta, 0, n-1)
	rows := m.listRows()
	offset := m.offsets[sectionDispatch]
	if m.cursor < offset {
		offset = m.cursor
	} else if m.cursor >= offset+rows {
		offset = m.cursor - rows + 1
	}
	m.offsets[sectionDispatch] = clamp(offset, 0, max(n-rows, 0))
}

func (m *tuiModel) openDispatchRun() tea.Cmd {
	m.disp.open = true
	if len(m.snap.dispatch.runs) == 0 {
		m.disp.runID = ""
		m.disp.run = nil
		m.disp.loading = true
		return m.fetchDispatchRun("")
	}
	idx := clamp(m.cursor, 0, len(m.snap.dispatch.runs)-1)
	m.cursor = idx
	target := m.snap.dispatch.runs[idx]
	m.disp.runID = target.ID
	copyRun := target
	m.disp.run = &copyRun
	m.disp.loading = true
	m.disp.err = nil
	return m.fetchDispatchRun(target.ID)
}

func (m *tuiModel) fetchDispatchRun(id string) tea.Cmd {
	dbPath := m.dbPath
	return func() tea.Msg {
		core, ok := runstate.ReadCore(dbPath)
		if !ok {
			return dispatchRunMsg{err: fmt.Errorf("core stopped")}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		run, err := newDispatchClient(coreclient.New(core, "tui")).GetRun(ctx, id)
		return dispatchRunMsg{run: run, err: err}
	}
}

func (m *tuiModel) updateDispatch(msg tea.Msg) (tea.Model, tea.Cmd) {
	if loaded, ok := msg.(dispatchRunMsg); ok {
		m.disp.loading = false
		m.disp.err = loaded.err
		if loaded.err == nil {
			run := loaded.run
			m.disp.run = &run
		}
	}
	return m, nil
}

func (m *tuiModel) handleDispatchKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "backspace", "q":
		m.disp.open = false
		return m, nil
	case "up", "k", "left", "h":
		if len(m.snap.dispatch.runs) > 0 {
			m.moveDispatch(-1)
			return m, m.openDispatchRun()
		}
	case "down", "j", "right", "l":
		if len(m.snap.dispatch.runs) > 0 {
			m.moveDispatch(1)
			return m, m.openDispatchRun()
		}
	case "enter", "r":
		m.disp.loading = true
		return m, m.fetchDispatchRun(m.disp.runID)
	}
	return m, nil
}

func (m *tuiModel) viewDispatch() string {
	var rows []string
	for i, run := range m.snap.dispatch.runs {
		status := styleDispatchStatus(run.Status)
		id := pad(shortID(run.ID), 12)
		if m.focus == sectionDispatch && i == m.cursor {
			id = styleAccent.Underline(true).Render(id)
		} else {
			id = styleMuted.Render(id)
		}
		who := run.Agent
		if run.Model != "" {
			who += "/" + run.Model
		}
		rows = append(rows, status+" "+id+" "+
			styleSubtle.Render(pad(run.Tier, 6))+" "+
			styleText.Render(pad(run.Prompt, 28))+" "+
			styleSubtle.Render(pad(who, 16))+" "+
			styleMuted.Render(since(run.CreatedAt)+" ago"))
	}
	empty := m.emptyText("no dispatch runs yet")
	if m.projectID != "" && len(rows) == 0 && m.snap.dispatch.err != nil {
		empty = m.snap.dispatch.err.Error()
	}
	return m.viewList(sectionDispatch, "Dispatch", empty, rows)
}

func (m *tuiModel) viewDispatchScreen() string {
	var b strings.Builder
	b.WriteString(m.viewHeader())
	b.WriteString("\n\n")
	b.WriteString(m.line(styleFocus.Render("Dispatch") + styleSubtle.Render("delegated run status")))
	b.WriteString("\n")

	if m.disp.loading {
		b.WriteString(m.line(styleLabel.Render("Status") + styleMuted.Render("loading…")))
	} else if m.disp.err != nil && m.disp.run == nil {
		b.WriteString(m.line(styleLabel.Render("Status") + styleDanger.Render(m.disp.err.Error())))
	} else if m.disp.run != nil {
		r := m.disp.run
		b.WriteString(m.line(styleLabel.Render("Run") + styleDispatchStatus(r.Status) + "  " + styleText.Render(r.ID)))
		b.WriteString(m.line(styleLabel.Render("Route") +
			styleText.Render(dispatchOrUnknown(r.Agent)+"/"+dispatchOrUnknown(r.Model)) +
			styleSubtle.Render("  tier "+dispatchOrUnknown(r.Tier)+"  provider "+dispatchOrUnknown(r.Provider)+"  effort "+dispatchOrUnknown(r.Effort))))
		if r.CardSlug != "" || r.AgentRunID != "" {
			b.WriteString(m.line(styleLabel.Render("Work") +
				styleSubtle.Render("card "+dispatchOrUnknown(r.CardSlug)+"  agent-run "+dispatchOrUnknown(r.AgentRunID))))
		}
		if r.Worktree != "" || r.Branch != "" {
			b.WriteString(m.line(styleLabel.Render("Worktree") +
				styleText.Render(dispatchOrUnknown(r.Branch)) + "  " + styleMuted.Render(shortPath(r.Worktree))))
		}
		b.WriteString(m.line(styleLabel.Render("Timing") +
			styleSubtle.Render(fmt.Sprintf("queue %s  run %s  verify %s",
				formatDispatchMs(r.QueuedMs), formatDispatchMs(r.RunMs), formatDispatchMs(r.VerifyMs)))))
		b.WriteString(m.line(styleLabel.Render("Result") +
			styleSubtle.Render(fmt.Sprintf("verification=%s  %s  attempts=%d",
				dispatchOrUnknown(r.Verification), formatDispatchFiles(r.FilesChanged, r.Insertions, r.Deletions), len(r.Attempts)))))
		if r.Prompt != "" {
			b.WriteString(m.line(styleLabel.Render("Prompt") + styleText.Render(oneLine(r.Prompt))))
		}
		if r.Error != "" {
			b.WriteString(m.line(styleLabel.Render("Error") + styleDanger.Render(oneLine(r.Error))))
		}
		if m.disp.err != nil {
			b.WriteString(m.line(styleLabel.Render("Notice") + styleWarning.Render(m.disp.err.Error())))
		}
	} else {
		b.WriteString(m.line(styleLabel.Render("Status") + styleMuted.Render("no dispatch run selected")))
	}

	b.WriteString("\n")
	b.WriteString(m.line(styleMuted.Render("↑↓/←→ select run · enter/r refresh · esc/q back")))
	return b.String()
}

func styleDispatchStatus(status string) string {
	label := pad(strings.ToLower(status), 9)
	switch status {
	case dispatch.StatusRunning, dispatch.StatusPending:
		return styleAccent.Render(label)
	case dispatch.StatusCompleted:
		return styleSuccess.Render(label)
	case dispatch.StatusFailed, dispatch.StatusOrphaned:
		return styleDanger.Render(label)
	case dispatch.StatusCancelled, dispatch.StatusTimedOut:
		return styleWarning.Render(label)
	default:
		return styleMuted.Render(label)
	}
}
