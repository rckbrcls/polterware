package drift

// Check runs the drift rules and returns a stable result.
func Check(input Input) Result {
	findings := make([]Finding, 0)
	if input.GitDeliveryReady {
		findings = append(findings, checkCommitTasks(input.DoneTasks, input.TaskCommits, input.WindowCommits)...)
	}
	if input.EntityID != "" {
		findings = filterByEntity(findings, input.EntityID)
	}
	return Result{
		ProjectID: input.ProjectID,
		EntityID:  input.EntityID,
		Status:    "ok",
		Checker:   CheckerNarrow,
		Findings:  findings,
	}
}

func filterByEntity(findings []Finding, entityID string) []Finding {
	out := make([]Finding, 0, len(findings))
	for _, finding := range findings {
		for _, id := range finding.SubjectIDs {
			if id == entityID {
				out = append(out, finding)
				break
			}
		}
	}
	return out
}
