package maintenance

import "context"

// Archiver copies the live database with VACUUM INTO.
type Archiver interface {
	Backup(ctx context.Context, destPath string) (int64, error)
}

// Service is the maintenance use-case port.
type Service interface {
	Export(ctx context.Context, zipPath string) (int64, error)
	Backup(ctx context.Context, destPath string) (path string, bytes int64, err error)
	Doctor(ctx context.Context) (Report, error)
}
