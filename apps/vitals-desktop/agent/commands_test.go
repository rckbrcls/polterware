package main

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestAuthorizeKill(t *testing.T) {
	missing := errors.New("process not found")
	tests := []struct {
		name     string
		pid      int
		agent    int
		owner    int
		ownerErr error
		sig      string
		wantErr  bool
	}{
		{name: "init", pid: 1, agent: 0, owner: 0, sig: "TERM", wantErr: true},
		{name: "zero", pid: 0, agent: 0, owner: 0, sig: "KILL", wantErr: true},
		{name: "bad signal", pid: 42, agent: 10, owner: 10, sig: "HUP", wantErr: true},
		{name: "other user", pid: 42, agent: 10, owner: 0, sig: "TERM", wantErr: true},
		{name: "missing", pid: 42, agent: 10, ownerErr: missing, sig: "TERM", wantErr: true},
		{name: "term", pid: 42, agent: 10, owner: 10, sig: "TERM"},
		{name: "kill", pid: 42, agent: 10, owner: 10, sig: "KILL"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := authorizeKill(tt.pid, tt.agent, tt.owner, tt.ownerErr, tt.sig)
			if tt.wantErr && err == nil {
				t.Fatal("expected error")
			}
			if !tt.wantErr && err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestDispatch(t *testing.T) {
	var gotPID int
	var gotSig string
	kill := func(pid int, sig string) error {
		gotPID, gotSig = pid, sig
		return authorizeKill(pid, 10, 10, nil, sig)
	}
	tests := []struct {
		name    string
		line    string
		typ     string
		ok      bool
		errText string
		pid     int
		sig     string
	}{
		{name: "ping", line: `{"cmd":"ping"}`, typ: "pong"},
		{name: "kill", line: `{"cmd":"kill","pid":42,"signal":"TERM","id":"abc"}`, typ: "kill_result", ok: true, pid: 42, sig: "TERM"},
		{name: "fractional pid", line: `{"cmd":"kill","pid":2.5,"signal":"KILL","id":"x"}`, typ: "kill_result", errText: "pid must be an integer"},
		{name: "pid one", line: `{"cmd":"kill","pid":1,"signal":"TERM","id":"x"}`, typ: "kill_result", errText: "pid must be greater than 1"},
		{name: "unknown", line: `{"cmd":"nope"}`},
		{name: "bad json", line: `{`, errText: "invalid command"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotPID, gotSig = 0, ""
			resp, warn := dispatch([]byte(tt.line), kill)
			if tt.name == "bad json" {
				if warn == "" || resp != nil {
					t.Fatalf("warn %q resp %s", warn, resp)
				}
				return
			}
			if warn != "" {
				t.Fatal(warn)
			}
			if tt.typ == "" {
				if resp != nil {
					t.Fatalf("unexpected %s", resp)
				}
				return
			}
			var head struct {
				Type  string `json:"type"`
				OK    bool   `json:"ok"`
				Error string `json:"error"`
				ID    string `json:"id"`
			}
			if err := json.Unmarshal(resp, &head); err != nil {
				t.Fatal(err)
			}
			if head.Type != tt.typ {
				t.Fatalf("type %s", head.Type)
			}
			if tt.typ == "kill_result" {
				if head.OK != tt.ok || head.Error != tt.errText {
					t.Fatalf("%+v", head)
				}
			}
			if tt.pid != 0 && (gotPID != tt.pid || gotSig != tt.sig) {
				t.Fatalf("kill %d %s", gotPID, gotSig)
			}
		})
	}
}
