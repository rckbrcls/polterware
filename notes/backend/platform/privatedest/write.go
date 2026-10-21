// Package privatedest writes new private outputs without following symlinks or replacing files.
package privatedest

import (
	"context"
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"golang.org/x/sys/unix"
)

// Write anchors every directory component to a descriptor and publishes with an
// exclusive hard-link operation. A replaced parent path cannot redirect the write.
func Write(ctx context.Context, path string, write func(*os.File) error) (int64, error) {
	if !filepath.IsAbs(path) || strings.ContainsRune(path, 0) {
		return 0, fmt.Errorf("output path must be absolute")
	}
	for _, part := range strings.Split(path, string(filepath.Separator)) {
		if part == "." || part == ".." {
			return 0, fmt.Errorf("output path must not contain traversal")
		}
	}
	path = filepath.Clean(path)
	if path == string(filepath.Separator) {
		return 0, fmt.Errorf("output file is required")
	}
	// These are OS-owned aliases on macOS, not user-selected symlink components.
	if runtime.GOOS == "darwin" {
		for _, alias := range []string{"/var", "/tmp"} {
			if strings.HasPrefix(path, alias+"/") {
				target, err := filepath.EvalSymlinks(alias)
				if err != nil {
					return 0, err
				}
				path = target + strings.TrimPrefix(path, alias)
				break
			}
		}
	}
	fd, err := unix.Open("/", unix.O_RDONLY|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
	if err != nil {
		return 0, err
	}
	dir := os.NewFile(uintptr(fd), "/")
	defer func() { dir.Close() }()
	for _, part := range strings.Split(strings.TrimPrefix(filepath.Dir(path), "/"), "/") {
		if part == "" {
			continue
		}
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		next, err := unix.Openat(int(dir.Fd()), part, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		if err == unix.ENOENT {
			if err = unix.Mkdirat(int(dir.Fd()), part, 0700); err != nil && err != unix.EEXIST {
				return 0, err
			}
			next, err = unix.Openat(int(dir.Fd()), part, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		}
		if err != nil {
			return 0, fmt.Errorf("open output directory: %w", err)
		}
		dir.Close()
		dir = os.NewFile(uintptr(next), part)
	}
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return 0, err
	}
	name := fmt.Sprintf(".notes-output-%x", nonce)
	fd, err = unix.Openat(int(dir.Fd()), name, unix.O_WRONLY|unix.O_CREAT|unix.O_EXCL|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0600)
	if err != nil {
		return 0, err
	}
	file := os.NewFile(uintptr(fd), name)
	defer file.Close()
	defer unix.Unlinkat(int(dir.Fd()), name, 0)
	if err := write(file); err != nil {
		return 0, err
	}
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if err := file.Sync(); err != nil {
		return 0, err
	}
	info, err := file.Stat()
	if err != nil {
		return 0, err
	}
	if err := file.Close(); err != nil {
		return 0, err
	}
	// Linkat never overwrites an existing file, symlink, hard link or directory.
	if err := unix.Linkat(int(dir.Fd()), name, int(dir.Fd()), filepath.Base(path), 0); err != nil {
		return 0, fmt.Errorf("publish new output (choose an unused destination): %w", err)
	}
	return info.Size(), nil
}
