// Package attachments is the attachment metadata and file store.
package attachments

import (
	"strings"
	"time"
)

const (
	KindPhoto = "photo"
	KindAudio = "audio"
	KindFile  = "file"
	KindLink  = "link"

	MaxPhotoBytes = 25 << 20
	MaxAudioBytes = 100 << 20
	MaxFileBytes  = 50 << 20
	HardMaxBytes  = 500 << 20
)

// Attachment is one attachments row.
// Links have URL set and RelPath nil. Files have RelPath set and URL nil.
type Attachment struct {
	ID        string
	NoteID    string
	Kind      string
	Name      *string
	Mime      *string
	SizeBytes *int64
	SHA256    *string
	RelPath   *string
	URL       *string
	Title     *string
	SortOrder int
	CreatedAt time.Time
}

// OpenInfo is the absolute path Main uses to preview a file.
type OpenInfo struct {
	ID           string
	AbsolutePath string
	Mime         string
	Name         string
	Kind         string
}

// ImportedFile is the result of copying a source path into the attachment directory.
type ImportedFile struct {
	RelPath   string
	SizeBytes int64
	SHA256    string
	Mime      string
}

// ByteLimit is the bounded import budget after MIME detection.
func ByteLimit(mime string) int64 {
	if strings.HasPrefix(mime, "image/") {
		return MaxPhotoBytes
	}
	if strings.HasPrefix(mime, "audio/") {
		return MaxAudioBytes
	}
	return MaxFileBytes
}
