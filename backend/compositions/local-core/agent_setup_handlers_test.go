package localcore

import (
	"context"
	"path/filepath"
	"testing"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/providers/agentsetup"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestHookSwitchesDefaultOnAndPersist(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "hooks.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	core := NewCore(store, "test-token")
	ctx := context.Background()

	listed, err := core.ListHookSwitches(ctx, connect.NewRequest(&localv1.ListHookSwitchesRequest{}))
	if err != nil || len(listed.Msg.Hooks) != len(agentsetup.Hooks) {
		t.Fatalf("list: err=%v hooks=%v", err, listed)
	}
	for _, hook := range listed.Msg.Hooks {
		if !hook.Enabled {
			t.Fatalf("%s should default to on", hook.Name)
		}
	}
	if _, err := core.SetHookSwitch(ctx, connect.NewRequest(&localv1.SetHookSwitchRequest{Name: "stop", Enabled: false})); err != nil {
		t.Fatal(err)
	}
	if _, err := core.SetHookSwitch(ctx, connect.NewRequest(&localv1.SetHookSwitchRequest{Name: "nope"})); err == nil {
		t.Fatal("unknown hook accepted")
	}
	after, _ := core.ListHookSwitches(ctx, connect.NewRequest(&localv1.ListHookSwitchesRequest{}))
	for _, hook := range after.Msg.Hooks {
		if want := hook.Name != "stop"; hook.Enabled != want {
			t.Fatalf("%s enabled=%v, want %v", hook.Name, hook.Enabled, want)
		}
	}
}
