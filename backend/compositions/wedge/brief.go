package wedge

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"path/filepath"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// queryBrief renders the brief of a card, a Structure node, or a file. A
// target that is neither a card nor a node is read as a file path and
// briefed as the node whose checkout holds it.
func queryBrief(store *storepkg.Store, snapshot work.Snapshot, scope structure.MultiScope, target string, budget int) (string, error) {
	in, err := briefInput(store, snapshot, scope)
	if err != nil {
		return "", err
	}
	text, err := polter.Brief(in, target, budget)
	if !errors.Is(err, polter.ErrUnknownBriefTarget) {
		return text, err
	}
	node, ok, lookupErr := NodeForPath(store, snapshot, target)
	if lookupErr != nil {
		return "", lookupErr
	}
	if !ok {
		return "", err
	}
	text, err = polter.Brief(in, node.Path, budget)
	if err != nil {
		return "", err
	}
	return "file " + strings.TrimSpace(target) + " is under " + node.Path + "\n" + text, nil
}

func querySearch(store *storepkg.Store, snapshot work.Snapshot, scope structure.MultiScope, terms string, budget int) (string, error) {
	in, err := briefInput(store, snapshot, scope)
	if err != nil {
		return "", err
	}
	return polter.Search(in, terms, budget), nil
}

// briefInput loads the in-scope docs and agent-visible canvases next to the
// snapshot. Canvas nodes linked to Structure carry the node's title.
func briefInput(store *storepkg.Store, snapshot work.Snapshot, scope structure.MultiScope) (polter.BriefInput, error) {
	resolved, err := store.LoadScopes(snapshot.ProjectID, scope)
	if err != nil {
		return polter.BriefInput{}, err
	}
	items, err := store.ListKnowledge(snapshot.ProjectID, knowledge.KindDoc)
	if err != nil {
		return polter.BriefInput{}, err
	}
	scopes, err := store.ScopeMap(snapshot.ProjectID, storepkg.ScopeKnowledge)
	if err != nil {
		return polter.BriefInput{}, err
	}
	in := polter.BriefInput{Snapshot: snapshot}
	for _, item := range items {
		if !resolved.MatchesAny(scopes[item.ID]) {
			continue
		}
		in.Docs = append(in.Docs, polter.Doc{ID: item.ID, Title: item.Title, DocType: item.DocType, ScopeNodeIDs: scopes[item.ID], Body: item.Body})
	}
	canvases, err := store.ListCanvases(snapshot.ProjectID)
	if err != nil {
		return polter.BriefInput{}, err
	}
	for _, item := range canvases {
		if !item.AgentVisible || !resolved.Matches(item.ScopeNodeID) {
			continue
		}
		item.Graph = canvas.WithStructure(item.Graph, snapshot.Nodes)
		in.Canvases = append(in.Canvases, item)
	}
	return in, nil
}

// NodeForPath finds the Structure node whose checkout holds a file: the
// node with the longest path: prefix in the file's checkout (the project
// root, or a registered repository). The file is absolute, relative to the
// project root, or written as repo:path. ok is false when no node claims it.
func NodeForPath(store *storepkg.Store, snapshot work.Snapshot, file string) (structure.Node, bool, error) {
	file = strings.TrimSpace(file)
	if file == "" {
		return structure.Node{}, false, nil
	}
	project, err := store.GetProject(snapshot.ProjectID)
	if err != nil {
		return structure.Node{}, false, err
	}
	repos, err := store.ListProjectRepos(snapshot.ProjectID)
	if err != nil {
		return structure.Node{}, false, err
	}
	repo, rel := "", ""
	if filepath.IsAbs(file) {
		// The deepest checkout that holds the file wins: a repo may sit inside the root.
		best := -1
		consider := func(name, root string) {
			if root == "" {
				return
			}
			inside, err := filepath.Rel(filepath.Clean(root), filepath.Clean(file))
			if err != nil || inside == ".." || strings.HasPrefix(inside, "../") || len(root) <= best {
				return
			}
			best, repo, rel = len(root), name, inside
		}
		consider("", project.RootPath)
		for _, item := range repos {
			consider(item.Name, item.Path)
		}
		if best < 0 {
			return structure.Node{}, false, nil
		}
	} else {
		rel = file
		if name, rest, ok := strings.Cut(file, ":"); ok {
			for _, item := range repos {
				if item.Name == name {
					repo, rel = name, rest
				}
			}
		}
	}
	rel = filepath.ToSlash(filepath.Clean(rel))
	var found structure.Node
	ok := false
	for _, node := range snapshot.Nodes {
		if node.Status == structure.NodeRemoved || node.Folder == "" || node.Repo != repo {
			continue
		}
		folder := strings.Trim(filepath.ToSlash(filepath.Clean(node.Folder)), "/")
		if rel != folder && !strings.HasPrefix(rel, folder+"/") {
			continue
		}
		if !ok || len(folder) > len(strings.Trim(found.Folder, "/")) {
			found, ok = node, true
		}
	}
	return found, ok, nil
}

// FileContextBudget bounds the brief the context hook adds per node.
const FileContextBudget = 400

// FileContext returns the brief of the Structure node that holds file, for the
// context hook. A session gets each node's brief once, and again only when it
// changed; sessionID "" always gets it. No node holding the file returns "".
func FileContext(store *storepkg.Store, projectID, sessionID, file string) (text, nodePath string, err error) {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return "", "", err
	}
	node, ok, err := NodeForPath(store, snapshot, file)
	if err != nil || !ok {
		return "", "", err
	}
	in, err := briefInput(store, snapshot, structure.MultiScope{})
	if err != nil {
		return "", "", err
	}
	body, err := polter.Brief(in, node.Path, FileContextBudget)
	if err != nil {
		return "", "", err
	}
	if sessionID != "" {
		sum := sha256.Sum256([]byte(body))
		fresh, err := store.MarkHookContextSeen(sessionID, projectID, node.ID, hex.EncodeToString(sum[:8]), time.Now())
		if err != nil {
			return "", "", err
		}
		if !fresh {
			return "", node.Path, nil
		}
	}
	return "Polterware: " + strings.TrimSpace(file) + " is under " + node.Path + ". Its brief, sent once per session:\n" + body, node.Path, nil
}
