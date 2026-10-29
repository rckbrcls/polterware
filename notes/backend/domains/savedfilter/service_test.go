package savedfilter

import (
	"context"
	"testing"
	"time"

	"github.com/polterware/polterware/notes/backend/domains/fault"
)

type stubClock struct{ t time.Time }

func (c stubClock) Now() time.Time { return c.t }

type stubIDs struct{}

func (stubIDs) New() string { return "01JSAVEDFILTER0000000000000" }

type recordRepo struct{ saved []SavedFilter }

func (r *recordRepo) List(context.Context, string) ([]SavedFilter, error) { return nil, nil }
func (r *recordRepo) Save(_ context.Context, f SavedFilter) (SavedFilter, error) {
	r.saved = append(r.saved, f)
	return f, nil
}
func (r *recordRepo) Delete(context.Context, string) error { return nil }

func TestValidatePayload(t *testing.T) {
	for raw, ok := range map[string]bool{
		`{"version":1,"clauses":[],"extra":{}}`: true,
		` {"version": 2, "clauses":[{"a":1}]} `: true,
		`{"version":-1}`:                        true,
		``:                                      false,
		`{}`:                                    false,
		`[]`:                                    false,
		`null`:                                  false,
		`"x"`:                                   false,
		`{"version":"1"}`:                       false,
		`{"version":1.5}`:                       false,
		`{"version":1e2}`:                       false,
		`{"version":1} {"version":1}`:           false,
		`{"version":1}x`:                        false,
		`{"version":99999999999999999999999999999}`: false,
	} {
		err := ValidatePayload(raw)
		if ok && err != nil {
			t.Errorf("%q: unexpected error %v", raw, err)
		}
		if !ok && !fault.IsCode(err, fault.CodeInvalid) {
			t.Errorf("%q: want invalid, got %v", raw, err)
		}
	}
}

func TestSaveTrimsAndValidates(t *testing.T) {
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	repo := &recordRepo{}
	svc := NewService(repo, stubClock{now}, stubIDs{})
	ctx := context.Background()
	f, err := svc.Save(ctx, "  notes.library ", " Urgent ", `{"version":1}`)
	if err != nil {
		t.Fatal(err)
	}
	if f.Surface != "notes.library" || f.Name != "Urgent" || f.ID == "" || !f.CreatedAt.Equal(now) || !f.UpdatedAt.Equal(now) {
		t.Fatalf("saved %+v", f)
	}
	for _, in := range [][3]string{
		{" ", "Urgent", `{"version":1}`},
		{"notes.library", "  ", `{"version":1}`},
		{"notes.library", "Urgent", `{"clauses":[]}`},
	} {
		if _, err := svc.Save(ctx, in[0], in[1], in[2]); !fault.IsCode(err, fault.CodeInvalid) {
			t.Errorf("%q: want invalid, got %v", in, err)
		}
	}
	if _, err := svc.List(ctx, ""); !fault.IsCode(err, fault.CodeInvalid) {
		t.Errorf("list without surface: %v", err)
	}
	if err := svc.Delete(ctx, " "); !fault.IsCode(err, fault.CodeInvalid) {
		t.Errorf("delete without id: %v", err)
	}
	if len(repo.saved) != 1 {
		t.Fatalf("invalid input reached the repository: %+v", repo.saved)
	}
}
