package fake

import (
	"context"

	"github.com/polterware/polterware/notes/backend/domains/attachments"
)

// Store is a repository-port skeleton. Methods panic until W1 replaces them.
type Store struct{}

var _ attachments.Store = (*Store)(nil)

func (*Store) List(context.Context, string) ([]attachments.Attachment, error) {
	panic("attachments/fake: not implemented")
}

func (*Store) Get(context.Context, string) (attachments.Attachment, error) {
	panic("attachments/fake: not implemented")
}

func (*Store) Insert(context.Context, attachments.Attachment) error {
	panic("attachments/fake: not implemented")
}

func (*Store) Delete(context.Context, string) error {
	panic("attachments/fake: not implemented")
}

func (*Store) Reorder(context.Context, string, []string) error {
	panic("attachments/fake: not implemented")
}

func (*Store) ImportFile(context.Context, string, string, string) (attachments.ImportedFile, error) {
	panic("attachments/fake: not implemented")
}

func (*Store) AbsolutePath(string) (string, error) {
	panic("attachments/fake: not implemented")
}

func (*Store) RemoveFile(context.Context, string) error {
	panic("attachments/fake: not implemented")
}
