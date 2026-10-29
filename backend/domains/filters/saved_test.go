package filters

import (
	"errors"
	"strings"
	"testing"
)

func TestPrepareSaveTrimsAndValidates(t *testing.T) {
	got, err := PrepareSave(SavedFilter{Surface: " work.board ", Name: " Mine ", PayloadJSON: ` {"version":1,"clauses":[]} `})
	if err != nil {
		t.Fatal(err)
	}
	if got.Surface != "work.board" || got.Name != "Mine" || got.PayloadJSON != `{"version":1,"clauses":[]}` {
		t.Fatalf("prepared = %+v", got)
	}
	cases := []struct {
		filter SavedFilter
		want   error
	}{
		{SavedFilter{Surface: " ", Name: "a", PayloadJSON: `{"version":1}`}, ErrSurfaceRequired},
		{SavedFilter{Surface: strings.Repeat("s", MaxSurfaceLen+1), Name: "a", PayloadJSON: `{"version":1}`}, ErrSurfaceLength},
		{SavedFilter{Surface: "work", Name: "  ", PayloadJSON: `{"version":1}`}, ErrNameRequired},
		{SavedFilter{Surface: "work", Name: strings.Repeat("n", MaxNameLen+1), PayloadJSON: `{"version":1}`}, ErrNameLength},
		{SavedFilter{Surface: "work", Name: "a", PayloadJSON: ""}, ErrPayload},
	}
	for _, tc := range cases {
		if _, err := PrepareSave(tc.filter); !errors.Is(err, tc.want) {
			t.Errorf("PrepareSave(%+v) = %v, want %v", tc.filter, err, tc.want)
		}
	}
}

func TestValidatePayload(t *testing.T) {
	for _, ok := range []string{`{"version":1}`, `{"version":2,"clauses":[{"field":"stage"}],"extra":{}}`} {
		if err := ValidatePayload(ok); err != nil {
			t.Errorf("ValidatePayload(%s) = %v", ok, err)
		}
	}
	for _, bad := range []string{`{}`, `[]`, `null`, `{"version":"1"}`, `{"version":1.5}`, `{"version":0}`, `{"version":1} {}`, `{`} {
		if err := ValidatePayload(bad); !errors.Is(err, ErrPayload) {
			t.Errorf("ValidatePayload(%s) = %v", bad, err)
		}
	}
}

func TestNextPosition(t *testing.T) {
	if NextPosition(nil) != 0 {
		t.Fatal("empty surface starts at 0")
	}
	if got := NextPosition([]SavedFilter{{Position: 2}, {Position: 0}}); got != 3 {
		t.Fatalf("next = %d", got)
	}
}
