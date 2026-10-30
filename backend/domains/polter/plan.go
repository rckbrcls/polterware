package polter

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// Plan diffs the desired state in doc against snapshot and returns the
// operations that make the store match. A text only touches what it mentions:
// absent cards, fields, and items are left as they are. Removal is explicit.
func Plan(doc Document, snapshot work.Snapshot) ([]work.Op, []Diagnostic) {
	return PlanAs(doc, snapshot, "")
}

// PlanAs is Plan for a session agent: holder is the label claim, done, and
// release lines act for. Without a holder those lines are errors.
func PlanAs(doc Document, snapshot work.Snapshot, holder string) ([]work.Op, []Diagnostic) {
	p := planner{
		snapshot:     snapshot,
		nextPosition: len(snapshot.Cards),
		nextNode:     len(snapshot.Nodes),
		holder:       strings.TrimSpace(holder),
		claims:       map[string]heldClaim{},
		taskState:    map[string]string{},
		removedCards: map[string]bool{},
		nodes:        map[string]structure.Node{},
		rules:        append([]work.Rule(nil), snapshot.Rules...),
	}
	for _, node := range snapshot.Nodes {
		p.nodes[node.Path] = node
	}
	for _, card := range snapshot.Cards {
		for _, task := range card.Tasks {
			if task.Claim != nil {
				p.claims[task.ID] = heldClaim{claim: *task.Claim, cardSlug: card.Slug, cardID: card.ID, number: task.Number}
			}
		}
	}
	p.diags = append(p.diags, CheckGraph(doc, snapshot.Nodes, snapshot.Cards)...)
	p.diags = append(p.diags, CheckRepos(doc, snapshot.Repos)...)
	p.diags = append(p.diags, CheckDeploys(doc, snapshot.Environments)...)
	p.planNodes(doc)
	for _, node := range doc.Cards {
		if existing, ok := snapshot.Card(node.Slug); ok {
			p.updateCard(node, existing)
		} else {
			p.createCard(node)
		}
	}
	p.planDecisions(doc)
	p.planFacts(doc)
	p.planRules(doc)
	return p.ops, p.diags
}

type planner struct {
	snapshot     work.Snapshot
	ops          []work.Op
	diags        []Diagnostic
	nextPosition int
	nextNode     int
	holder       string
	// nodes is the project's structure nodes by path, including ones this text creates.
	nodes map[string]structure.Node
	// rules is the project's active Rules, updated as ops are planned.
	rules []work.Rule
	// claims is the project's active claims by task id, updated as ops are planned.
	claims map[string]heldClaim
	// taskState holds task states this text changes, by task id.
	taskState    map[string]string
	removedCards map[string]bool
}

type heldClaim struct {
	claim    work.Claim
	cardSlug string
	cardID   string
	number   int
}

func (p *planner) errorf(line int, format string, args ...any) {
	p.diags = append(p.diags, Diagnostic{Line: line, Severity: SeverityError, Message: fmt.Sprintf(format, args...)})
}

func (p *planner) hintf(line int, format string, args ...any) {
	p.diags = append(p.diags, Diagnostic{Line: line, Severity: SeverityHint, Message: fmt.Sprintf(format, args...)})
}

func (p *planner) failed(line int) bool {
	for _, diag := range p.diags {
		if diag.Line == line && diag.Severity == SeverityError {
			return true
		}
	}
	return false
}

// failedDeploys reports a decode error on the node's deploys: line. Those
// errors sit on the metadata line, not the heading, so failed(node.Line) misses
// them. A bad line must not write the node.
func (p *planner) failedDeploys(node StructureNode) bool {
	for _, entry := range node.Meta {
		if entry.Key == "deploys" && p.failed(entry.Line) {
			return true
		}
	}
	return false
}

func (p *planner) planNodes(doc Document) {
	for _, node := range doc.Nodes {
		if p.failed(node.Line) || p.failedDeploys(node) {
			continue
		}
		under, hasUnder := node.MetaValue("under")
		path, parent, fromPath, message := ResolveNode(node.Path, under, hasUnder)
		if message != "" {
			continue
		}
		if fromPath == "" && hasUnder {
			if _, ok := p.nodes[node.Path]; ok && path != node.Path {
				fromPath = node.Path
			}
		}
		level, _ := node.MetaValue("level")
		lookup := path
		if fromPath != "" {
			lookup = fromPath
		}
		existing, exists := p.nodes[lookup]
		if level == "" && exists {
			level = existing.Level
		}
		parentID := ""
		if parent != "" {
			parentNode, ok := p.nodes[parent]
			if !ok || parentNode.Status == structure.NodeRemoved {
				continue
			}
			parentID = parentNode.ID
		}
		if !exists {
			p.createNode(node, path, level, parentID)
			continue
		}
		p.updateNode(node, existing, path, level, parentID)
		if fromPath != "" && fromPath != path {
			delete(p.nodes, fromPath)
			p.rewriteMovedPaths(fromPath, path)
		}
	}
}

func (p *planner) createNode(node StructureNode, path, level, parentID string) {
	if node.Title == "" {
		p.errorf(node.Line, "unknown node %q: add a title (# %s: Title)", path, node.Path)
		return
	}
	if status, _ := node.MetaValue("status"); status == structure.NodeRemoved {
		p.errorf(node.Line, "cannot remove unknown node %q: check the path", path)
		return
	}
	decisions, _ := node.MetaValue("decisions")
	repo, _ := node.MetaValue("repo")
	folder, _ := node.MetaValue("path")
	kind, _ := node.MetaValue("kind")
	tech, _ := node.MetaValue("tech")
	if kind != "" && level != structure.LevelComponent {
		p.errorf(metaLine(node, "kind"), "kind %q on %s %q: only components have a kind", kind, level, path)
		return
	}
	migrating, _ := node.MetaValue("migrating")
	migrationFrom, migrationTo, _ := ParseMigration(migrating)
	deploys, _, err := resolveDeploys(node, nil, p.snapshot.Environments)
	if err != nil {
		p.errorf(deploysLine(node), "%s", err.Error())
		return
	}
	id := ids.NewULID()
	created := structure.Node{
		ID: id, Slug: node.Slug, Path: path, Title: node.Title, Intent: node.Intent,
		Level: level, Status: structure.NodeActive, ParentID: parentID, Position: p.nextNode,
		Repo: repo, Folder: folder, Kind: kind, Tech: tech,
		MigrationFrom: migrationFrom, MigrationTo: migrationTo, Deploys: deploys,
	}
	p.ops = append(p.ops, work.Op{
		Entity: work.EntityNode, Kind: work.OpCreate, EntityID: id, CardSlug: path, Label: node.Title,
		Fields: map[string]any{
			"slug": node.Slug, "title": node.Title, "intent": node.Intent, "level": level,
			"status": structure.NodeActive, "path": path, "parent_id": parentID,
			"decisions": splitList(decisions), "position": p.nextNode,
			"repo": repo, "folder": folder, "kind": kind, "tech": tech,
			"migration_from": migrationFrom, "migration_to": migrationTo,
			"deploys": nonNilDeploys(deploys),
		},
	})
	p.nextNode++
	p.nodes[path] = created
	p.nodeRules(node, &created)
	p.nodes[path] = created
}

func (p *planner) updateNode(node StructureNode, existing structure.Node, path, level, parentID string) {
	fields, before := map[string]any{}, map[string]any{}
	set := func(key string, old, value any) {
		fields[key], before[key] = value, old
	}
	if node.Title != "" && node.Title != existing.Title {
		set("title", existing.Title, node.Title)
	}
	if node.IntentSet && node.Intent != existing.Intent {
		set("intent", existing.Intent, node.Intent)
	}
	if level != "" && level != existing.Level {
		set("level", existing.Level, level)
	}
	if parentID != existing.ParentID {
		set("parent_id", existing.ParentID, parentID)
	}
	if path != existing.Path {
		set("path", existing.Path, path)
	}
	if decisions, ok := node.MetaValue("decisions"); ok {
		if list := splitList(decisions); !slices.Equal(list, existing.Decisions) {
			set("decisions", existing.Decisions, list)
		}
	}
	// A present deploys: replaces the node's links; an empty value clears them.
	// An absent line leaves the stored links alone.
	if deploys, mentioned, err := resolveDeploys(node, existing.Deploys, p.snapshot.Environments); err != nil {
		p.errorf(deploysLine(node), "%s", err.Error())
		return
	} else if mentioned {
		if !sameDeploys(deploys, existing.Deploys) {
			set("deploys", nonNilDeploys(existing.Deploys), deploys)
		}
		existing.Deploys = deploys
	}
	// A present repo: or path: is authoritative, so an empty value moves the
	// node back to the project root or the checkout root.
	if repo, ok := node.MetaValue("repo"); ok && repo != existing.Repo {
		set("repo", existing.Repo, repo)
	}
	if folder, ok := node.MetaValue("path"); ok && folder != existing.Folder {
		set("folder", existing.Folder, folder)
	}
	// A present kind: or tech: is authoritative; an empty value clears it. A
	// node that stops being a component must clear its kind in the same block.
	kind := existing.Kind
	if value, ok := node.MetaValue("kind"); ok {
		kind = value
		if kind != existing.Kind {
			set("kind", existing.Kind, kind)
		}
	}
	if effective := cmp.Or(level, existing.Level); kind != "" && effective != structure.LevelComponent {
		p.errorf(metaLine(node, "kind"), "kind %q on %s %q: only components have a kind (write kind: to clear it)", kind, effective, path)
		return
	}
	if tech, ok := node.MetaValue("tech"); ok && tech != existing.Tech {
		set("tech", existing.Tech, tech)
	}
	// A present migrating: is authoritative; an empty value clears the state.
	migrationFrom, migrationTo := existing.MigrationFrom, existing.MigrationTo
	if value, ok := node.MetaValue("migrating"); ok {
		from, to, _ := ParseMigration(value)
		if from != existing.MigrationFrom {
			set("migration_from", existing.MigrationFrom, from)
		}
		if to != existing.MigrationTo {
			set("migration_to", existing.MigrationTo, to)
		}
		migrationFrom, migrationTo = from, to
	}
	status, hasStatus := node.MetaValue("status")
	if hasStatus && status != existing.Status {
		set("status", existing.Status, status)
	}
	if len(fields) > 0 {
		kind := work.OpUpdate
		if fields["status"] == structure.NodeRemoved {
			kind = work.OpRemove
		}
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityNode, Kind: kind, EntityID: existing.ID, CardSlug: path,
			Label: existing.Title, Fields: fields, Before: before,
		})
	}
	if status == structure.NodeRemoved {
		existing.Status = structure.NodeRemoved
		p.nodes[path] = existing
		return
	}
	if level != "" {
		existing.Level = level
	}
	existing.ParentID = parentID
	existing.Path = path
	if repo, ok := node.MetaValue("repo"); ok {
		existing.Repo = repo
	}
	if folder, ok := node.MetaValue("path"); ok {
		existing.Folder = folder
	}
	existing.Kind = kind
	if tech, ok := node.MetaValue("tech"); ok {
		existing.Tech = tech
	}
	existing.MigrationFrom, existing.MigrationTo = migrationFrom, migrationTo
	p.nodeRules(node, &existing)
	p.nodes[path] = existing
}

// rewriteMovedPaths updates descendants and work cards after a node changes path.
func (p *planner) rewriteMovedPaths(oldPath, newPath string) {
	if oldPath == "" || oldPath == newPath {
		return
	}
	prefix := oldPath + "/"
	olds := make([]string, 0)
	for path := range p.nodes {
		if strings.HasPrefix(path, prefix) {
			olds = append(olds, path)
		}
	}
	slices.Sort(olds)
	for _, old := range olds {
		node := p.nodes[old]
		next := newPath + old[len(oldPath):]
		delete(p.nodes, old)
		node.Path = next
		p.nodes[next] = node
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityNode, Kind: work.OpUpdate, EntityID: node.ID,
			CardSlug: next, Label: node.Title,
			Fields: map[string]any{"path": next},
			Before: map[string]any{"path": old},
		})
	}
	for _, card := range p.snapshot.Cards {
		under := card.Under
		if under != oldPath && !strings.HasPrefix(under, prefix) {
			continue
		}
		next := newPath + under[len(oldPath):]
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityCard, Kind: work.OpUpdate, EntityID: card.ID, CardID: card.ID,
			CardSlug: card.Slug, Label: card.Title,
			Fields: map[string]any{"under": next},
			Before: map[string]any{"under": under},
		})
	}
}

func (p *planner) createCard(node CardNode) {
	if node.Title == "" {
		p.errorf(node.Line, "unknown card %q: add a title (## %s: Title)", node.Slug, node.Slug)
		return
	}
	if status, _ := node.MetaValue("status"); status == work.CardRemoved {
		p.errorf(node.Line, "cannot remove unknown card %q: check the slug", node.Slug)
		return
	}
	stage, ok := node.MetaValue("stage")
	if !ok {
		stage = work.StageShape
	}
	owner, _ := node.MetaValue("owner")
	under, _ := node.MetaValue("under")
	decisions, _ := node.MetaValue("decisions")
	kind, ok := node.MetaValue("kind")
	if !ok {
		kind = work.KindFeature
	}
	milestoneID, ok := p.milestoneID(node)
	if !ok {
		return
	}
	card := work.Card{ID: ids.NewULID(), Slug: node.Slug}
	fields := map[string]any{
		"slug":      node.Slug,
		"title":     node.Title,
		"intent":    node.Intent,
		"stage":     stage,
		"status":    work.CardActive,
		"owner":     owner,
		"kind":      kind,
		"under":     under,
		"decisions": splitList(decisions),
		"position":  p.nextPosition,
	}
	if milestoneID != "" {
		fields["milestone"] = milestoneID
	}
	p.ops = append(p.ops, work.Op{
		Entity:   work.EntityCard,
		Kind:     work.OpCreate,
		EntityID: card.ID,
		CardID:   card.ID,
		CardSlug: node.Slug,
		Label:    node.Title,
		Fields:   fields,
	})
	p.nextPosition++
	p.children(node, card)
}

// milestoneID resolves the card's milestone: slug to a listed milestone id.
// An absent or empty line is "" (the Backlog); an unknown slug is an error.
func (p *planner) milestoneID(node CardNode) (string, bool) {
	slug, _ := node.MetaValue("milestone")
	if slug == "" {
		return "", true
	}
	milestone, ok := work.FindMilestone(p.snapshot.Milestones, slug)
	if !ok {
		line := node.Line
		for _, entry := range node.Meta {
			if entry.Key == "milestone" {
				line = entry.Line
			}
		}
		p.errorf(line, "unknown milestone %q: list them with polterware query milestones, or create one in the Desktop", slug)
		return "", false
	}
	return milestone.ID, true
}

func (p *planner) updateCard(node CardNode, card work.Card) {
	fields, before := map[string]any{}, map[string]any{}
	set := func(key string, old, value any) {
		fields[key], before[key] = value, old
	}
	if node.Title != "" && node.Title != card.Title {
		set("title", card.Title, node.Title)
	}
	if node.IntentSet && node.Intent != card.Intent {
		set("intent", card.Intent, node.Intent)
	}
	for _, key := range MetaKeys {
		value, ok := node.MetaValue(key)
		if !ok {
			continue
		}
		switch key {
		case "stage":
			if value != card.Stage {
				set(key, card.Stage, value)
			}
		case "status":
			if value != card.Status {
				set(key, card.Status, value)
			}
		case "owner":
			if value != card.Owner {
				set(key, card.Owner, value)
			}
		case "kind":
			if value != card.Kind {
				set(key, card.Kind, value)
			}
		case "under":
			if value != card.Under {
				set(key, card.Under, value)
			}
		case "milestone":
			id, ok := p.milestoneID(node)
			if !ok {
				return
			}
			if id != card.MilestoneID {
				set(key, card.MilestoneID, id)
			}
		case "decisions":
			if list := splitList(value); !slices.Equal(list, card.Decisions) {
				set(key, card.Decisions, list)
			}
		}
	}
	if len(fields) > 0 {
		kind := work.OpUpdate
		if fields["status"] == work.CardRemoved {
			kind = work.OpRemove
		}
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityCard, Kind: kind, EntityID: card.ID, CardID: card.ID,
			CardSlug: card.Slug, Label: card.Title, Fields: fields, Before: before,
		})
		if kind == work.OpRemove {
			p.removedCards[card.ID] = true
			for _, task := range card.Tasks {
				p.releaseClaim(task.ID)
			}
		}
	}
	p.children(node, card)
}

func (p *planner) children(node CardNode, card work.Card) {
	p.tasks(node, card)
	p.questions(node, card)
	p.invariants(node, card)
	p.handoff(node, card)
	p.coordination(node, card)
}

// coordination plans claim, done, and release lines against stored tasks.
func (p *planner) coordination(node CardNode, card work.Card) {
	for _, line := range node.Coordination {
		if p.holder == "" {
			p.errorf(line.Line, "%s needs an agent: pass --agent or set POLTERWARE_AGENT_LABEL", line.Action)
			continue
		}
		var task work.Task
		found := false
		for _, t := range card.Tasks {
			if t.Number == line.Number {
				task, found = t, true
				break
			}
		}
		if !found {
			p.errorf(line.Line, "unknown task T%d in %q: apply the task before you %s it", line.Number, card.Slug, line.Action)
			continue
		}
		if card.ID == "" || card.Status == work.CardRemoved || p.removedCards[card.ID] {
			p.errorf(line.Line, "cannot %s T%d: card %q is removed", line.Action, line.Number, card.Slug)
			continue
		}
		state := task.State
		if planned, ok := p.taskState[task.ID]; ok {
			state = planned
		}
		held, claimed := p.claims[task.ID]
		switch line.Action {
		case CoordClaim:
			p.claim(line, card, task, state, held, claimed)
		case CoordDone:
			if state == work.TaskDropped {
				p.errorf(line.Line, "cannot mark T%d done: it is dropped", line.Number)
				continue
			}
			if claimed && held.claim.Holder != p.holder {
				p.errorf(line.Line, "cannot mark %s T%d done: %s", card.Slug, line.Number, describeClaim(held))
				continue
			}
			if state != work.TaskDone {
				p.taskState[task.ID] = work.TaskDone
				p.ops = append(p.ops, work.Op{
					Entity: work.EntityTask, Kind: work.OpUpdate, EntityID: task.ID, CardID: card.ID,
					CardSlug: card.Slug, Label: fmt.Sprintf("T%d", task.Number),
					Fields: map[string]any{"state": work.TaskDone}, Before: map[string]any{"state": state},
				})
			}
			p.releaseClaim(task.ID)
		case CoordRelease:
			if !claimed {
				continue
			}
			if held.claim.Holder != p.holder {
				p.errorf(line.Line, "cannot release %s T%d: %s", card.Slug, line.Number, describeClaim(held))
				continue
			}
			p.releaseClaim(task.ID)
		}
	}
}

func (p *planner) claim(line CoordNode, card work.Card, task work.Task, state string, held heldClaim, claimed bool) {
	if state != work.TaskOpen {
		p.errorf(line.Line, "cannot claim %s T%d: it is %s", card.Slug, line.Number, state)
		return
	}
	if claimed {
		if held.claim.Holder != p.holder {
			p.errorf(line.Line, "cannot claim %s T%d: %s", card.Slug, line.Number, describeClaim(held))
		}
		return
	}
	scope := work.QualifyScope(task.Repo, task.Scope)
	if scope != "" {
		otherIDs := make([]string, 0, len(p.claims))
		for otherID := range p.claims {
			otherIDs = append(otherIDs, otherID)
		}
		slices.Sort(otherIDs)
		for _, otherID := range otherIDs {
			other := p.claims[otherID]
			if otherID == task.ID || other.claim.Holder == p.holder {
				continue
			}
			if work.ScopesOverlap(scope, other.claim.Scope) {
				p.errorf(line.Line, "cannot claim %s T%d: scope %s overlaps %s T%d held by %s (%s)",
					card.Slug, line.Number, scope, other.cardSlug, other.number, other.claim.Holder, other.claim.Scope)
				return
			}
		}
	}
	claim := work.Claim{ID: ids.NewULID(), ProjectID: p.snapshot.ProjectID, TaskID: task.ID, Holder: p.holder, Scope: scope}
	p.claims[task.ID] = heldClaim{claim: claim, cardSlug: card.Slug, cardID: card.ID, number: task.Number}
	p.ops = append(p.ops, work.Op{
		Entity: work.EntityClaim, Kind: work.OpCreate, EntityID: claim.ID, CardID: card.ID,
		CardSlug: card.Slug, Label: fmt.Sprintf("T%d", task.Number),
		Fields: map[string]any{"task_id": task.ID, "holder": claim.Holder, "scope": claim.Scope},
	})
}

// releaseClaim plans the removal of taskID's claim, if it has one.
func (p *planner) releaseClaim(taskID string) {
	held, ok := p.claims[taskID]
	if !ok {
		return
	}
	delete(p.claims, taskID)
	p.ops = append(p.ops, work.Op{
		Entity: work.EntityClaim, Kind: work.OpRemove, EntityID: held.claim.ID, CardID: held.cardID,
		CardSlug: held.cardSlug, Label: fmt.Sprintf("T%d", held.number),
		Fields: map[string]any{"holder": held.claim.Holder, "scope": held.claim.Scope},
	})
}

func describeClaim(held heldClaim) string {
	scope := held.claim.Scope
	if scope == "" {
		scope = "no scope"
	}
	return fmt.Sprintf("claimed by %s (%s)", held.claim.Holder, scope)
}

func (p *planner) handoff(node CardNode, card work.Card) {
	if node.Handoff == nil {
		return
	}
	h := node.Handoff
	if strings.TrimSpace(h.Branch) == "" {
		p.errorf(h.Line, `handoff needs branch: add "branch: <name>"`)
		return
	}
	if existing, ok := card.LatestHandoff(h.Branch); ok && sameHandoff(existing, *h) {
		return
	}
	id := ids.NewULID()
	p.ops = append(p.ops, work.Op{
		Entity: work.EntityHandoff, Kind: work.OpCreate, EntityID: id, CardID: card.ID,
		CardSlug: card.Slug, Label: h.Branch,
		Fields: map[string]any{
			"branch": h.Branch, "agent": h.Agent, "goal": h.Goal, "done": h.Done,
			"in_progress": h.InProgress, "next": h.Next, "touched": nonNil(h.Touched),
		},
	})
}

func sameHandoff(existing work.Handoff, node HandoffNode) bool {
	return existing.Branch == node.Branch && existing.Agent == node.Agent && existing.Goal == node.Goal &&
		existing.Done == node.Done && existing.InProgress == node.InProgress && existing.Next == node.Next &&
		sameStrings(existing.Touched, node.Touched)
}

func sameStrings(a, b []string) bool {
	if len(a) == 0 && len(b) == 0 {
		return true
	}
	return slices.Equal(a, b)
}

func (p *planner) tasks(node CardNode, card work.Card) {
	maxNumber, maxPosition := 0, -1
	byNumber := map[int]work.Task{}
	for _, task := range card.Tasks {
		byNumber[task.Number] = task
		maxNumber = max(maxNumber, task.Number)
		maxPosition = max(maxPosition, task.Position)
	}
	for _, t := range node.Tasks {
		maxNumber = max(maxNumber, t.Number)
	}
	matched := map[string]bool{}

	for _, t := range node.Tasks {
		var existing work.Task
		found := false
		if t.Number > 0 {
			existing, found = byNumber[t.Number]
			if !found && len(card.Tasks) > 0 {
				p.errorf(t.Line, "unknown task T%d in %q: drop the number to create a new task", t.Number, card.Slug)
				continue
			}
		} else {
			key := work.NormalizeText(t.Title)
			for _, task := range card.Tasks {
				if !matched[task.ID] && work.NormalizeText(task.Title) == key {
					existing, found = task, true
					break
				}
			}
		}

		if !found {
			number := t.Number
			if number == 0 {
				maxNumber++
				number = maxNumber
			}
			maxPosition++
			id := ids.NewULID()
			p.ops = append(p.ops, work.Op{
				Entity: work.EntityTask, Kind: work.OpCreate, EntityID: id, CardID: card.ID,
				CardSlug: card.Slug, Label: fmt.Sprintf("T%d", number),
				Fields: map[string]any{
					"number": number, "title": t.Title, "state": t.State, "repo": t.Repo, "scope": t.Scope, "position": maxPosition,
				},
			})
			continue
		}

		matched[existing.ID] = true
		fields, before := map[string]any{}, map[string]any{}
		if t.Title != existing.Title {
			fields["title"], before["title"] = t.Title, existing.Title
		}
		if t.State != existing.State {
			fields["state"], before["state"] = t.State, existing.State
		}
		if t.Scope != "" && t.Scope != existing.Scope {
			fields["scope"], before["scope"] = t.Scope, existing.Scope
		}
		if t.Repo != "" && t.Repo != existing.Repo {
			fields["repo"], before["repo"] = t.Repo, existing.Repo
		}
		if len(fields) == 0 {
			continue
		}
		kind := work.OpUpdate
		if fields["state"] == work.TaskDropped {
			kind = work.OpRemove
		}
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityTask, Kind: kind, EntityID: existing.ID, CardID: card.ID,
			CardSlug: card.Slug, Label: fmt.Sprintf("T%d", existing.Number), Fields: fields, Before: before,
		})
		if state, ok := fields["state"].(string); ok {
			p.taskState[existing.ID] = state
			// A task leaves its claim when the checkbox closes it.
			if state != work.TaskOpen {
				p.releaseClaim(existing.ID)
			}
		}
	}
}

func (p *planner) questions(node CardNode, card work.Card) {
	maxPosition := -1
	for _, q := range card.Questions {
		maxPosition = max(maxPosition, q.Position)
	}
	for _, q := range node.Questions {
		key := work.NormalizeText(q.Text)
		var existing *work.Question
		for i := range card.Questions {
			if work.NormalizeText(card.Questions[i].Text) == key {
				existing = &card.Questions[i]
				break
			}
		}
		if existing == nil {
			if q.Removed {
				continue
			}
			maxPosition++
			id := ids.NewULID()
			state := work.QuestionOpen
			if q.Answer != "" {
				state = work.QuestionAnswered
				p.answerHint(q, q.Options)
			}
			card.Questions = append(card.Questions, work.Question{ID: id, Text: q.Text, Blocking: q.Blocking, Options: q.Options, State: state, Answer: q.Answer})
			fields := map[string]any{
				"text": q.Text, "blocking": q.Blocking, "options": nonNil(q.Options),
				"state": state, "position": maxPosition,
			}
			if q.Answer != "" {
				fields["answer"] = q.Answer
			}
			p.ops = append(p.ops, work.Op{
				Entity: work.EntityQuestion, Kind: work.OpCreate, EntityID: id, CardID: card.ID,
				CardSlug: card.Slug, Label: q.Text, Fields: fields,
			})
			continue
		}
		fields, before := map[string]any{}, map[string]any{}
		if q.Removed {
			if existing.State != work.QuestionRemoved {
				fields["state"], before["state"] = work.QuestionRemoved, existing.State
			}
		} else {
			switch {
			case q.Answer != "":
				// A line without an answer never reopens a decided question.
				if existing.State != work.QuestionAnswered {
					fields["state"], before["state"] = work.QuestionAnswered, existing.State
				}
				if q.Answer != existing.Answer {
					fields["answer"], before["answer"] = q.Answer, existing.Answer
				}
				if len(fields) > 0 {
					options := q.Options
					if len(options) == 0 {
						options = existing.Options
					}
					p.answerHint(q, options)
				}
			case existing.State == work.QuestionRemoved:
				fields["state"], before["state"] = work.QuestionOpen, existing.State
			}
			if q.Text != existing.Text {
				fields["text"], before["text"] = q.Text, existing.Text
			}
			if q.Blocking != existing.Blocking {
				fields["blocking"], before["blocking"] = q.Blocking, existing.Blocking
			}
			if len(q.Options) > 0 && !slices.Equal(q.Options, existing.Options) {
				fields["options"], before["options"] = q.Options, existing.Options
			}
		}
		if len(fields) == 0 {
			continue
		}
		kind := work.OpUpdate
		if q.Removed {
			kind = work.OpRemove
		}
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityQuestion, Kind: kind, EntityID: existing.ID, CardID: card.ID,
			CardSlug: card.Slug, Label: existing.Text, Fields: fields, Before: before,
		})
	}
}

// answerHint flags an answer that is none of the question's options. Free
// answers are allowed; the hint catches a typo.
func (p *planner) answerHint(q QuestionNode, options []string) {
	if len(options) == 0 {
		return
	}
	for _, option := range options {
		if work.NormalizeText(option) == work.NormalizeText(q.Answer) {
			return
		}
	}
	p.hintf(q.Line, "answer %q is not one of the options (%s)", q.Answer, strings.Join(options, " | "))
}

func (p *planner) invariants(node CardNode, card work.Card) {
	maxPosition := -1
	for _, inv := range card.Invariants {
		maxPosition = max(maxPosition, inv.Position)
	}
	for _, inv := range node.Invariants {
		key := work.NormalizeText(inv.Text)
		var existing *work.Invariant
		for i := range card.Invariants {
			if work.NormalizeText(card.Invariants[i].Text) == key {
				existing = &card.Invariants[i]
				break
			}
		}
		if existing == nil {
			if inv.Removed {
				continue
			}
			maxPosition++
			id := ids.NewULID()
			card.Invariants = append(card.Invariants, work.Invariant{ID: id, Text: inv.Text, State: work.InvariantActive})
			p.ops = append(p.ops, work.Op{
				Entity: work.EntityInvariant, Kind: work.OpCreate, EntityID: id, CardID: card.ID,
				CardSlug: card.Slug, Label: inv.Text,
				Fields: map[string]any{"text": inv.Text, "state": work.InvariantActive, "position": maxPosition},
			})
			continue
		}
		fields, before := map[string]any{}, map[string]any{}
		want := work.InvariantActive
		if inv.Removed {
			want = work.InvariantRemoved
		}
		if existing.State != want {
			fields["state"], before["state"] = want, existing.State
		}
		if !inv.Removed && inv.Text != existing.Text {
			fields["text"], before["text"] = inv.Text, existing.Text
		}
		if len(fields) == 0 {
			continue
		}
		kind := work.OpUpdate
		if inv.Removed {
			kind = work.OpRemove
		}
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityInvariant, Kind: kind, EntityID: existing.ID, CardID: card.ID,
			CardSlug: card.Slug, Label: existing.Text, Fields: fields, Before: before,
		})
	}
}

func splitList(value string) []string {
	out := []string{}
	for _, part := range strings.Split(value, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

// FormatPlan renders ops terraform-style, one line each.
func FormatPlan(ops []work.Op) string {
	if len(ops) == 0 {
		return "no changes\n"
	}
	var b strings.Builder
	for _, op := range ops {
		sign := "~"
		switch op.Kind {
		case work.OpCreate:
			sign = "+"
		case work.OpRemove:
			sign = "-"
		}
		fmt.Fprintf(&b, "%s %s %s", sign, op.Entity, op.CardSlug)
		switch op.Entity {
		case work.EntityCard:
			if op.Kind == work.OpCreate {
				fmt.Fprintf(&b, " %q [%v]", op.Label, op.Fields["stage"])
			}
		case work.EntityNode:
			if _, invariant := op.Fields["text"]; invariant {
				fmt.Fprintf(&b, " %q", op.Label)
				break
			}
			if op.Kind == work.OpCreate {
				fmt.Fprintf(&b, " %q [%v]", op.Label, op.Fields["level"])
			}
		case work.EntityTask:
			fmt.Fprintf(&b, " %s", op.Label)
			if op.Kind == work.OpCreate {
				fmt.Fprintf(&b, " %q", op.Fields["title"])
			}
		case work.EntityClaim:
			fmt.Fprintf(&b, " %s %v", op.Label, op.Fields["holder"])
			if scope, _ := op.Fields["scope"].(string); scope != "" {
				fmt.Fprintf(&b, " (%s)", scope)
			}
			b.WriteString("\n")
			continue
		default:
			fmt.Fprintf(&b, " %q", op.Label)
			if op.Kind == work.OpCreate && op.Fields["blocking"] == true {
				b.WriteString(" [blocking]")
			}
		}
		if op.Kind != work.OpCreate {
			keys := make([]string, 0, len(op.Fields))
			for key := range op.Fields {
				keys = append(keys, key)
			}
			slices.Sort(keys)
			for _, key := range keys {
				fmt.Fprintf(&b, " %s: %s → %s", key, short(op.Before[key]), short(op.Fields[key]))
			}
		}
		b.WriteString("\n")
	}
	return b.String()
}

func short(value any) string {
	text := fmt.Sprint(value)
	if list, ok := value.([]string); ok {
		text = "[" + strings.Join(list, ", ") + "]"
	}
	if deploys, ok := value.([]structure.Deployment); ok {
		parts := make([]string, len(deploys))
		for i, deploy := range deploys {
			name := deploy.Environment
			if name == "" {
				name = deploy.EnvironmentID
			}
			parts[i] = name + "=" + deploy.Provider + ":" + deploy.Resource
		}
		text = "[" + strings.Join(parts, ", ") + "]"
	}
	if text == "" {
		return `""`
	}
	if runes := []rune(text); len(runes) > 40 {
		return fmt.Sprintf("%q", string(runes[:37])+"...")
	}
	if strings.ContainsAny(text, " \n") {
		return fmt.Sprintf("%q", text)
	}
	return text
}

// Summarize returns "5 ops (1 card, 4 tasks)".
func Summarize(ops []work.Op) string {
	counts := map[string]int{}
	for _, op := range ops {
		counts[op.Entity]++
	}
	var parts []string
	for _, entity := range []string{work.EntityCard, work.EntityTask, work.EntityQuestion, work.EntityInvariant, work.EntityHandoff, work.EntityClaim, work.EntityNode, work.EntityDecision, work.EntityFact} {
		if n := counts[entity]; n > 0 {
			noun := entity
			if n > 1 {
				noun += "s"
			}
			parts = append(parts, fmt.Sprintf("%d %s", n, noun))
		}
	}
	noun := "ops"
	if len(ops) == 1 {
		noun = "op"
	}
	return fmt.Sprintf("%d %s (%s)", len(ops), noun, strings.Join(parts, ", "))
}
