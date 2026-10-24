package dispatch

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/polterware/polterware/backend/providers/dispatch/sandbox"
)

type cachedCheck struct {
	IDs    []string `json:"ids,omitempty"`
	Passed bool     `json:"passed"`
}

type verifyCacheFile struct {
	Checks map[string]cachedCheck `json:"checks"`
}

func verifyCachePath(base, hash string) string {
	return filepath.Join(verifyDispatchHome(), "baselines", base+"-"+hash+".json")
}

// verifyBaseline runs the failed checks at BaseSHA, reusing a cache keyed by the
// base commit and the effective config. The temporary worktree is removed
// before return, including when ctx is cancelled.
func verifyBaseline(ctx context.Context, repo, base string, all, need []verifyCheck) (map[string]cachedCheck, bool, error) {
	path := verifyCachePath(base, verifyConfigHash(all))
	cache := readVerifyCache(path)
	var missing []verifyCheck
	for _, c := range need {
		if _, ok := cache.Checks[c.Name]; !ok {
			missing = append(missing, c)
		}
	}
	if len(missing) == 0 {
		return cache.Checks, true, nil
	}
	dir, err := addDetachedWorktree(ctx, repo, base)
	if err != nil {
		return nil, false, err
	}
	defer removeDetachedWorktree(repo, dir)
	if cache.Checks == nil {
		cache.Checks = map[string]cachedCheck{}
	}
	for _, c := range missing {
		if err := ctx.Err(); err != nil {
			return nil, false, err
		}
		ex := runVerifyCheck(ctx, c, dir)
		if ex.status == CheckError {
			if ex.err != nil {
				return nil, false, ex.err
			}
			return nil, false, fmt.Errorf("baseline %s failed to run", c.Name)
		}
		cache.Checks[c.Name] = cachedCheck{IDs: ex.ids, Passed: ex.status == CheckPassed}
	}
	_ = writeVerifyCache(path, cache)
	return cache.Checks, false, nil
}

func readVerifyCache(path string) verifyCacheFile {
	b, err := os.ReadFile(path)
	if err != nil {
		return verifyCacheFile{Checks: map[string]cachedCheck{}}
	}
	var f verifyCacheFile
	if json.Unmarshal(b, &f) != nil || f.Checks == nil {
		return verifyCacheFile{Checks: map[string]cachedCheck{}}
	}
	return f
}

func writeVerifyCache(path string, f verifyCacheFile) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func addDetachedWorktree(ctx context.Context, repo, sha string) (string, error) {
	var buf [6]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	dir := filepath.Join(verifyDispatchHome(), "tmp", "baseline-"+hex.EncodeToString(buf[:]))
	if err := os.MkdirAll(filepath.Dir(dir), 0o755); err != nil {
		return "", err
	}
	cmd := exec.CommandContext(ctx, "git", "-C", repo, "worktree", "add", "--detach", "--quiet", dir, sha)
	cmd.Env = sandbox.Environ()
	out, err := cmd.CombinedOutput()
	if err != nil {
		os.RemoveAll(dir)
		msg := strings.TrimSpace(string(out))
		return "", fmt.Errorf("baseline worktree: %v: %s", err, msg)
	}
	return dir, nil
}

func removeDetachedWorktree(repo, dir string) {
	cmd := exec.Command("git", "-C", repo, "worktree", "remove", "--force", dir)
	cmd.Env = sandbox.Environ()
	_ = cmd.Run()
	_ = os.RemoveAll(dir)
	prune := exec.Command("git", "-C", repo, "worktree", "prune")
	prune.Env = sandbox.Environ()
	_ = prune.Run()
}
