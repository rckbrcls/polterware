package localcore

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/dispatch"
	"github.com/polterware/polterware/backend/domains/projects"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/platform/gen/polterware/local/v1/localv1connect"
)

func TestDispatchServiceRequiresBearerToken(t *testing.T) {
	_, url := startCore(t)
	client := localv1connect.NewDispatchServiceClient(http.DefaultClient, url)
	_, err := client.ListTiers(context.Background(), connect.NewRequest(&localv1.ListTiersRequest{}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("code = %v, want unauthenticated", connect.CodeOf(err))
	}
}

func TestDispatchTiersStatsResultAndWatch(t *testing.T) {
	core, url := startCore(t)
	core.DBDir = t.TempDir()
	ctx := context.Background()
	client := localv1connect.NewDispatchServiceClient(http.DefaultClient, url)

	tiersRes, err := client.ListTiers(ctx, withToken(connect.NewRequest(&localv1.ListTiersRequest{}), testToken))
	if err != nil {
		t.Fatal(err)
	}
	if len(tiersRes.Msg.Tiers) == 0 {
		t.Fatal("expected seeded default tiers")
	}

	checkRes, err := client.CheckTiers(ctx, withToken(connect.NewRequest(&localv1.CheckTiersRequest{}), testToken))
	if err != nil {
		t.Fatal(err)
	}
	_ = checkRes.Msg.Problems

	projRoot := t.TempDir()
	proj, err := projects.NewProject("proj-dispatch", "Dispatch Test", projRoot)
	if err != nil {
		t.Fatal(err)
	}
	if err := core.Store.SaveProject(proj); err != nil {
		t.Fatal(err)
	}

	now := time.Now().UTC()
	filesChanged := 2
	run := dispatch.Run{
		ID:           "run-1",
		ProjectID:    proj.ID,
		Status:       dispatch.StatusCompleted,
		Tier:         dispatch.TierEasy,
		Agent:        "codex",
		Model:        "gpt-5.4",
		Provider:     "openai",
		Prompt:       "fix bug",
		Dir:          projRoot,
		Output:       "line1\nline2\nline3\n",
		Verification: "passed",
		VerifyJSON:   `{"status":"passed"}`,
		FilesChanged: &filesChanged,
		CreatedAt:    now.Add(-2 * time.Second),
		StartedAt:    now.Add(-2 * time.Second),
		FinishedAt:   now,
	}
	if err := core.Store.SaveRun(ctx, run); err != nil {
		t.Fatal(err)
	}
	if err := core.Store.AppendEvent(ctx, dispatch.RunEvent{
		RunID:     run.ID,
		ProjectID: proj.ID,
		Kind:      dispatch.EventStarted,
		Agent:     run.Agent,
		Tier:      run.Tier,
		Text:      run.Prompt,
		At:        now,
	}); err != nil {
		t.Fatal(err)
	}

	logPath := filepath.Join(core.dispatchStateDir(), "logs", run.ID+".agent.log")
	if err := os.MkdirAll(filepath.Dir(logPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(logPath, []byte("streamed line\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	stream, err := client.WatchRun(ctx, withToken(connect.NewRequest(&localv1.WatchRunRequest{Id: run.ID}), testToken))
	if err != nil {
		t.Fatal(err)
	}
	var kinds []string
	for stream.Receive() {
		kinds = append(kinds, stream.Msg().Kind)
	}
	if err := stream.Err(); err != nil {
		t.Fatal(err)
	}
	if len(kinds) < 2 || kinds[0] != dispatch.EventStarted || kinds[1] != dispatch.EventOutput {
		t.Fatalf("watch kinds = %v", kinds)
	}

	for _, sec := range []string{"summary", "verification", "files", "attempts", "meta", "output"} {
		res, err := client.Result(ctx, withToken(connect.NewRequest(&localv1.ResultRequest{
			Id:      run.ID,
			Section: sec,
			Offset:  0,
			Limit:   10,
		}), testToken))
		if err != nil {
			t.Fatalf("section %s: %v", sec, err)
		}
		if sec == "meta" && strings.Contains(res.Msg.Content, "line1") {
			t.Fatalf("meta leaked output body: %s", res.Msg.Content)
		}
	}

	if _, err := client.Result(ctx, withToken(connect.NewRequest(&localv1.ResultRequest{
		Id:      run.ID,
		Section: "unknown",
	}), testToken)); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("unknown section code = %v, want invalid_argument", connect.CodeOf(err))
	}

	statsRes, err := client.Stats(ctx, withToken(connect.NewRequest(&localv1.StatsRequest{
		ProjectId: proj.ID,
		By:        "model",
		Since:     "7d",
	}), testToken))
	if err != nil {
		t.Fatal(err)
	}
	if len(statsRes.Msg.Rows) != 1 || statsRes.Msg.Rows[0].Key != "gpt-5.4" || statsRes.Msg.Rows[0].P50Ms == nil {
		t.Fatalf("stats = %+v", statsRes.Msg)
	}
}

func TestDispatchReplaceTiersStoresOrderAndRejectsInvalidRows(t *testing.T) {
	_, url := startCore(t)
	ctx := context.Background()
	client := localv1connect.NewDispatchServiceClient(http.DefaultClient, url)

	res, err := client.ReplaceTiers(ctx, withToken(connect.NewRequest(&localv1.ReplaceTiersRequest{Tiers: []*localv1.DispatchTier{
		{Name: "easy", Agent: "grok", Model: "grok-4.7", Speed: 4, Strength: 2, Position: 9},
		{Name: "easy", Agent: "codex", Model: "gpt-5.6-luna"},
		{Name: "hard", Agent: "codex", Model: "gpt-6.1-sol", Strength: 5},
	}}), testToken))
	if err != nil {
		t.Fatal(err)
	}
	var easy []string
	for _, tier := range res.Msg.Tiers {
		if tier.Name == "easy" {
			easy = append(easy, tier.Agent)
			if tier.Agent == "codex" && tier.Position != 1 {
				t.Fatalf("codex position = %d, want 1", tier.Position)
			}
			if tier.Agent == "grok" && tier.Provider != "xai" {
				t.Fatalf("grok provider = %q, want derived xai", tier.Provider)
			}
		}
	}
	if strings.Join(easy, ",") != "grok,codex" {
		t.Fatalf("easy order = %v", easy)
	}

	listed, err := client.ListTiers(ctx, withToken(connect.NewRequest(&localv1.ListTiersRequest{}), testToken))
	if err != nil {
		t.Fatal(err)
	}
	if len(listed.Msg.Tiers) != 3 {
		t.Fatalf("stored %d tiers, want 3", len(listed.Msg.Tiers))
	}

	for _, bad := range []*localv1.DispatchTier{
		{Name: "extreme", Agent: "codex", Model: "gpt-5.6-luna"},
		{Name: "easy", Agent: "", Model: "gpt-5.6-luna"},
		{Name: "easy", Agent: "codex", Model: "gpt-5.6-luna", Speed: 9},
	} {
		_, err := client.ReplaceTiers(ctx, withToken(connect.NewRequest(&localv1.ReplaceTiersRequest{Tiers: []*localv1.DispatchTier{bad}}), testToken))
		if connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Fatalf("row %+v: code = %v, want invalid argument", bad, connect.CodeOf(err))
		}
	}
}
