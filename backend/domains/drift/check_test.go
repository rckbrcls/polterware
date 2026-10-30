package drift

import "testing"

func TestCheckCommitTask(t *testing.T) {
	result := Check(Input{
		ProjectID:        "proj",
		GitDeliveryReady: true,
		DoneTasks: []DoneTask{
			{ID: "task-done", CardID: "card", Slug: "git-metadata-import", Number: 2},
			{ID: "task-linked", CardID: "card", Slug: "git-metadata-import", Number: 1},
		},
		TaskCommits: []TaskCommit{
			{TaskID: "task-linked", SHA: "aaa", OnMain: true},
			{TaskID: "task-done", SHA: "ccc", OnMain: false},
		},
		WindowCommits: []WindowCommit{
			{SHA: "aaa", Subject: "linked", OnMain: true},
			{SHA: "bbb", Subject: "no task", OnMain: true},
			{SHA: "ccc", Subject: "feature", OnMain: false},
		},
	})
	var unmatched, bare int
	for _, finding := range result.Findings {
		switch finding.Type {
		case TypeTaskDoneUnmatched:
			unmatched++
			if finding.Severity != SeverityWarning || finding.Summary != "task git-metadata-import T2 is done with no commit on main" || finding.Details["task_id"] != "task-done" {
				t.Fatalf("unmatched: %+v", finding)
			}
		case TypeCommitWithoutTask:
			bare++
			if finding.Summary != `commit "no task" is on main with no task` || finding.SubjectIDs[0] != CommitKey("", "bbb") {
				t.Fatalf("bare commit: %+v", finding)
			}
		}
	}
	if unmatched != 1 || bare != 1 {
		t.Fatalf("findings: %+v", result.Findings)
	}

	skipped := Check(Input{
		ProjectID:     "proj",
		DoneTasks:     []DoneTask{{ID: "task-done", Slug: "git-metadata-import", Number: 2}},
		WindowCommits: []WindowCommit{{SHA: "bbb", Subject: "no task", OnMain: true}},
	})
	if len(skipped.Findings) != 0 {
		t.Fatalf("git not ready should skip commit drift: %+v", skipped.Findings)
	}
}

func TestCheckEntityFilter(t *testing.T) {
	result := Check(Input{
		ProjectID:        "proj",
		EntityID:         "task-keep",
		GitDeliveryReady: true,
		DoneTasks: []DoneTask{
			{ID: "task-keep", Slug: "a", Number: 1},
			{ID: "task-other", Slug: "a", Number: 2},
		},
	})
	if len(result.Findings) != 1 || result.Findings[0].SubjectIDs[0] != "task-keep" {
		t.Fatalf("filter should keep only the task: %+v", result.Findings)
	}
}
