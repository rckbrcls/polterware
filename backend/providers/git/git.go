package git

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"time"

	execpkg "github.com/polterware/polterware/backend/providers/exec"
)

// RecentCommitLimit is how many first-parent commits a metadata read keeps.
const RecentCommitLimit = 20

func Status(ctx context.Context, cwd string) (string, error) {
	res := execpkg.Run(ctx, "git", []string{"status", "--porcelain"}, cwd)
	if res.Err != nil && res.ExitCode != 0 {
		return res.Stderr, res.Err
	}
	return res.Stdout, nil
}

// Observation is a local read of one work tree. It never contacts a remote.
type Observation struct {
	Available bool
	Branch    string
	Files     []string
	// Delivered is true when HEAD is an ancestor of local main or master.
	Delivered bool
}

// Observe reads branch, changed paths, and whether HEAD is on main.
// A directory that is not a work tree returns a zero Observation.
func Observe(ctx context.Context, root string) Observation {
	if strings.TrimSpace(root) == "" {
		return Observation{}
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	inside, ok := gitOut(ctx, root, "rev-parse", "--is-inside-work-tree")
	if !ok || inside != "true" {
		return Observation{}
	}
	obs := Observation{Available: true}
	if branch, ok := gitOut(ctx, root, "rev-parse", "--abbrev-ref", "HEAD"); ok {
		obs.Branch = branch
	}
	main := ""
	if base, ok := DeliveryBase(ctx, root); ok {
		main = base
	}
	var files []string
	if main != "" {
		if base, ok := gitOut(ctx, root, "merge-base", "HEAD", main); ok && base != "" {
			files = append(files, gitLines(ctx, root, "diff", "--name-only", base, "HEAD")...)
		}
		if _, ok := gitOut(ctx, root, "merge-base", "--is-ancestor", "HEAD", main); ok {
			obs.Delivered = true
		}
	}
	files = append(files, gitLines(ctx, root, "diff", "--name-only")...)
	files = append(files, gitLines(ctx, root, "diff", "--name-only", "--cached")...)
	files = append(files, gitLines(ctx, root, "ls-files", "--others", "--exclude-standard")...)
	obs.Files = uniquePaths(files)
	return obs
}

// Commit is one local commit subject. It is not a remote object.
type Commit struct {
	SHA     string
	Subject string
}

// Metadata is HEAD, the current branch, and recent first-parent commits.
// Available is false outside a work tree and when HEAD cannot be read.
type Metadata struct {
	Available bool
	SHA       string
	Branch    string
	Commits   []Commit
}

// ReadMetadata reads HEAD, the branch name, and up to RecentCommitLimit
// first-parent commits. It never contacts a remote. A missing work tree
// or a repository with no commits returns a zero Metadata. A failed commit
// log still returns HEAD.
func ReadMetadata(ctx context.Context, root string) Metadata {
	if strings.TrimSpace(root) == "" {
		return Metadata{}
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	inside, ok := gitOut(ctx, root, "rev-parse", "--is-inside-work-tree")
	if !ok || inside != "true" {
		return Metadata{}
	}
	sha, ok := gitOut(ctx, root, "rev-parse", "HEAD")
	if !ok || sha == "" {
		return Metadata{}
	}
	meta := Metadata{Available: true, SHA: sha, Branch: "HEAD"}
	if branch, ok := gitOut(ctx, root, "rev-parse", "--abbrev-ref", "HEAD"); ok && branch != "" {
		meta.Branch = branch
	}
	logOut, ok := gitOut(ctx, root, "log", "-n", strconv.Itoa(RecentCommitLimit), "--first-parent", "--format=%H%x1f%s")
	if !ok || logOut == "" {
		return meta
	}
	for _, line := range strings.Split(logOut, "\n") {
		shaPart, subject, found := strings.Cut(line, "\x1f")
		shaPart = strings.TrimSpace(shaPart)
		if !found || shaPart == "" {
			continue
		}
		meta.Commits = append(meta.Commits, Commit{SHA: shaPart, Subject: strings.TrimSpace(subject)})
	}
	return meta
}

// DeliveryBase is the local branch a commit must be an ancestor of before
// a task treats it as delivered: refs/heads/main, or refs/heads/master when
// main is absent. ok is false outside a work tree and when neither ref exists.
func DeliveryBase(ctx context.Context, root string) (string, bool) {
	if strings.TrimSpace(root) == "" {
		return "", false
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, ok := gitOut(ctx, root, "rev-parse", "--verify", "--quiet", "refs/heads/main"); ok {
		return "refs/heads/main", true
	}
	if _, ok := gitOut(ctx, root, "rev-parse", "--verify", "--quiet", "refs/heads/master"); ok {
		return "refs/heads/master", true
	}
	return "", false
}

// AncestorsOf reports which shas are ancestors of base, including base itself.
// A sha that cannot be resolved is false. The read is local.
func AncestorsOf(ctx context.Context, root, base string, shas []string) map[string]bool {
	out := map[string]bool{}
	if strings.TrimSpace(root) == "" || strings.TrimSpace(base) == "" {
		return out
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	for _, sha := range shas {
		sha = strings.TrimSpace(sha)
		if sha == "" {
			continue
		}
		if _, seen := out[sha]; seen {
			continue
		}
		_, ok := gitOut(ctx, root, "merge-base", "--is-ancestor", sha, base)
		out[sha] = ok
	}
	return out
}

func gitOut(ctx context.Context, root string, args ...string) (string, bool) {
	res := execpkg.Run(ctx, "git", args, root)
	if res.ExitCode != 0 {
		return "", false
	}
	return strings.TrimSpace(res.Stdout), true
}

func gitLines(ctx context.Context, root string, args ...string) []string {
	out, ok := gitOut(ctx, root, args...)
	if !ok || out == "" {
		return nil
	}
	return strings.Split(out, "\n")
}

func uniquePaths(paths []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, path := range paths {
		path = strings.TrimSpace(strings.ReplaceAll(path, "\\", "/"))
		if path == "" || seen[path] {
			continue
		}
		seen[path] = true
		out = append(out, path)
	}
	sort.Strings(out)
	return out
}

// CommitTime returns the committer time of ref (a sha, branch, or tag). It
// reports false outside a work tree or when ref does not name a commit.
func CommitTime(ctx context.Context, root, ref string) (time.Time, bool) {
	out, ok := gitOut(ctx, root, "log", "-1", "--format=%cI", ref+"^{commit}", "--")
	if !ok || out == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339, out)
	return t, err == nil
}

// ResolveCommit returns the full sha of ref when it names a commit in root.
func ResolveCommit(ctx context.Context, root, ref string) (string, bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" || strings.HasPrefix(ref, "-") {
		return "", false
	}
	out, ok := gitOut(ctx, root, "rev-parse", "--verify", "--quiet", ref+"^{commit}")
	if !ok || out == "" {
		return "", false
	}
	return out, true
}

// CommitDetail is one commit's subject and committer time, read by ref.
type CommitDetail struct {
	SHA         string
	Subject     string
	CommittedAt time.Time
}

// ReadCommit returns the full sha, subject, and committer time of ref when it
// names a commit in root.
func ReadCommit(ctx context.Context, root, ref string) (CommitDetail, bool) {
	sha, ok := ResolveCommit(ctx, root, ref)
	if !ok {
		return CommitDetail{}, false
	}
	out, ok := gitOut(ctx, root, "log", "-1", "--format=%s%x1f%cI", sha, "--")
	if !ok {
		return CommitDetail{SHA: sha}, true
	}
	subject, when, _ := strings.Cut(out, "\x1f")
	detail := CommitDetail{SHA: sha, Subject: strings.TrimSpace(subject)}
	detail.CommittedAt, _ = time.Parse(time.RFC3339, strings.TrimSpace(when))
	return detail, true
}

// GitHubRepo returns "owner/repo" for root's origin when it is on GitHub
// (git@github.com:o/r.git, ssh://git@github.com/o/r, or https://github.com/o/r),
// and false for any other remote or none.
func GitHubRepo(ctx context.Context, root string) (string, bool) {
	remote, ok := gitOut(ctx, root, "remote", "get-url", "origin")
	if !ok {
		return "", false
	}
	return ParseGitHubRemote(remote)
}

// ParseGitHubRemote reads "owner/repo" from a GitHub remote URL.
func ParseGitHubRemote(remote string) (string, bool) {
	remote = strings.TrimSpace(remote)
	var path string
	switch {
	case strings.HasPrefix(remote, "git@github.com:"):
		path = strings.TrimPrefix(remote, "git@github.com:")
	default:
		for _, prefix := range []string{"https://github.com/", "http://github.com/", "ssh://git@github.com/", "git://github.com/"} {
			if strings.HasPrefix(remote, prefix) {
				path = strings.TrimPrefix(remote, prefix)
				break
			}
		}
		if path == "" {
			// https://user@github.com/o/r
			if at := strings.Index(remote, "@github.com/"); at >= 0 && strings.HasPrefix(remote, "https://") {
				path = remote[at+len("@github.com/"):]
			}
		}
	}
	path = strings.TrimSuffix(strings.TrimSuffix(path, "/"), ".git")
	owner, repo, found := strings.Cut(path, "/")
	if !found || owner == "" || repo == "" || strings.Contains(repo, "/") {
		return "", false
	}
	return owner + "/" + repo, true
}

// GitHubCommitURL is the commit's page on GitHub.
func GitHubCommitURL(ownerRepo, sha string) string {
	return "https://github.com/" + ownerRepo + "/commit/" + sha
}
