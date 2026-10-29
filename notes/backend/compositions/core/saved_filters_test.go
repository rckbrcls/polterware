package core

import (
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/polterware/polterware/notes/backend/platform/gen/notes/v1"
)

func TestSavedFilterRPCs(t *testing.T) {
	clients, _, _ := sqliteLoopback(t)
	ctx := t.Context()
	save := func(surface, name, payload string) (*v1.SavedFilter, error) {
		res, err := clients.SavedFilter.Save(ctx, connect.NewRequest(&v1.SaveSavedFilterRequest{Surface: surface, Name: name, PayloadJson: payload}))
		if err != nil {
			return nil, err
		}
		return res.Msg.Filter, nil
	}
	first, err := save(" notes.library", "Urgent ", `{"version":1,"clauses":[],"extra":{}}`)
	if err != nil {
		t.Fatal(err)
	}
	if first.Id == "" || first.Surface != "notes.library" || first.Name != "Urgent" || first.Position != 0 || first.CreatedAt == nil || first.UpdatedAt == nil {
		t.Fatalf("first %+v", first)
	}
	second, err := save("notes.library", "Inbox", `{"version":1}`)
	if err != nil {
		t.Fatal(err)
	}
	again, err := save("notes.library", "Urgent", `{"version":1,"clauses":[{"field":"tag"}]}`)
	if err != nil {
		t.Fatal(err)
	}
	if again.Id != first.Id || again.Position != 0 || again.PayloadJson != `{"version":1,"clauses":[{"field":"tag"}]}` {
		t.Fatalf("upsert %+v", again)
	}

	list, err := clients.SavedFilter.List(ctx, connect.NewRequest(&v1.ListSavedFiltersRequest{Surface: "notes.library"}))
	if err != nil {
		t.Fatal(err)
	}
	if got := list.Msg.Filters; len(got) != 2 || got[0].Id != first.Id || got[1].Id != second.Id {
		t.Fatalf("list %+v", got)
	}
	if other, err := clients.SavedFilter.List(ctx, connect.NewRequest(&v1.ListSavedFiltersRequest{Surface: "notes.search"})); err != nil || len(other.Msg.Filters) != 0 {
		t.Fatalf("other surface %v %v", other, err)
	}

	for _, bad := range [][3]string{
		{"", "Urgent", `{"version":1}`},
		{"notes.library", "", `{"version":1}`},
		{"notes.library", "Bad", `[]`},
		{"notes.library", "Bad", `{"version":"1"}`},
	} {
		if _, err := save(bad[0], bad[1], bad[2]); connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Errorf("%q: want invalid argument, got %v", bad, err)
		}
	}
	if _, err := clients.SavedFilter.List(ctx, connect.NewRequest(&v1.ListSavedFiltersRequest{})); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("list without surface: %v", err)
	}

	if _, err := clients.SavedFilter.Delete(ctx, connect.NewRequest(&v1.DeleteSavedFilterRequest{Id: first.Id})); err != nil {
		t.Fatal(err)
	}
	if _, err := clients.SavedFilter.Delete(ctx, connect.NewRequest(&v1.DeleteSavedFilterRequest{Id: first.Id})); connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("delete missing: %v", err)
	}
	list, err = clients.SavedFilter.List(ctx, connect.NewRequest(&v1.ListSavedFiltersRequest{Surface: "notes.library"}))
	if err != nil || len(list.Msg.Filters) != 1 || list.Msg.Filters[0].Id != second.Id {
		t.Fatalf("after delete %v %v", list, err)
	}
}
