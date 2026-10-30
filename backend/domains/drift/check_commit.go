package drift

import "fmt"

func checkCommitTasks(tasks []DoneTask, links []TaskCommit, window []WindowCommit) []Finding {
	onMain := map[string]bool{}
	linked := map[string]bool{}
	for _, link := range links {
		linked[CommitKey(link.Repo, link.SHA)] = true
		if link.OnMain {
			onMain[link.TaskID] = true
		}
	}

	findings := make([]Finding, 0)
	for _, task := range tasks {
		if onMain[task.ID] {
			continue
		}
		findings = append(findings, Finding{
			Type:       TypeTaskDoneUnmatched,
			Severity:   SeverityWarning,
			Summary:    fmt.Sprintf("task %s T%d is done with no commit on main", task.Slug, task.Number),
			SubjectIDs: []string{task.ID},
			Details: map[string]string{
				"slug":    task.Slug,
				"task":    fmt.Sprintf("T%d", task.Number),
				"task_id": task.ID,
				"title":   task.Title,
			},
		})
	}
	for _, commit := range window {
		key := CommitKey(commit.Repo, commit.SHA)
		if !commit.OnMain || linked[key] {
			continue
		}
		findings = append(findings, Finding{
			Type:       TypeCommitWithoutTask,
			Severity:   SeverityWarning,
			Summary:    fmt.Sprintf("commit %q is on main with no task", commit.Subject),
			SubjectIDs: []string{key},
			Details: map[string]string{
				"repo":    commit.Repo,
				"sha":     commit.SHA,
				"subject": commit.Subject,
			},
		})
	}
	return findings
}
