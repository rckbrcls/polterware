package core

import (
	"os"
	"path/filepath"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

func TestMaintenanceOutputsArePrivateAndNeverClobber(t *testing.T) {
	clients, state, _ := sqliteLoopback(t)
	dir := t.TempDir()
	for _, kind := range []string{"backup", "export"} {
		t.Run(kind, func(t *testing.T) {
			dest := filepath.Join(dir, kind)
			write := func(path string) error {
				if kind == "backup" {
					_, err := clients.Maintenance.Backup(t.Context(), connect.NewRequest(&v1.BackupRequest{DestPath: path}))
					return err
				}
				_, err := clients.Maintenance.Export(t.Context(), connect.NewRequest(&v1.ExportRequest{ZipPath: path}))
				return err
			}
			if err := write(dest); err != nil {
				t.Fatal(err)
			}
			info, err := os.Stat(dest)
			if err != nil || info.Mode().Perm() != 0600 {
				t.Fatalf("output is not private: %v %v", info, err)
			}
			original, err := os.ReadFile(dest)
			if err != nil {
				t.Fatal(err)
			}
			if err := write(dest); err == nil {
				t.Fatal("overwrote an existing output")
			}
			after, _ := os.ReadFile(dest)
			if string(original) != string(after) {
				t.Fatal("changed existing bytes")
			}
			linked := filepath.Join(dir, kind+"-link")
			if err := os.Symlink(state.DBPath, linked); err != nil {
				t.Fatal(err)
			}
			if err := write(linked); err == nil {
				t.Fatal("accepted a destination symlink")
			}
			if err := write(state.DBPath); err == nil {
				t.Fatal("clobbered the live database")
			}
		})
	}
}
