package polter

import (
	"regexp"
	"sort"
	"strconv"

	"github.com/polterware/polterware/backend/domains/work"
)

// CommitRef is one task citation found in a commit subject.
type CommitRef struct {
	Slug   string
	Number int
}

var (
	// polter: git-metadata-import#T2
	polterCommitRef = regexp.MustCompile(`(?:^|[^A-Za-z0-9-])polter:[ \t]*([a-z0-9]+(?:-[a-z0-9]+)*)#T([1-9][0-9]{0,5})(?:[^0-9]|$)`)
	// git-metadata-import#T2
	hashCommitRef = regexp.MustCompile(`(?:^|[^A-Za-z0-9-])([a-z0-9]+(?:-[a-z0-9]+)*)#T([1-9][0-9]{0,5})(?:[^0-9]|$)`)
	// git-metadata-import T2
	plainCommitRef = regexp.MustCompile(`(?:^|[^A-Za-z0-9-])([a-z0-9]+(?:-[a-z0-9]+)*)[ \t]+T([1-9][0-9]{0,5})(?:[^0-9]|$)`)
)

// ParseCommitRefs finds explicit task citations in a commit subject.
// The forms are `slug#T2`, `slug T2`, and `polter: slug#T2`. Order is first
// appearance. A repeated citation is returned once.
func ParseCommitRefs(subject string) []CommitRef {
	type hit struct {
		ref CommitRef
		at  int
	}
	var hits []hit
	collect := func(pattern *regexp.Regexp) {
		for _, match := range pattern.FindAllStringSubmatchIndex(subject, -1) {
			if len(match) < 6 || match[2] < 0 || match[4] < 0 {
				continue
			}
			number, err := strconv.Atoi(subject[match[4]:match[5]])
			if err != nil {
				continue
			}
			hits = append(hits, hit{
				ref: CommitRef{Slug: subject[match[2]:match[3]], Number: number},
				at:  match[2],
			})
		}
	}
	collect(polterCommitRef)
	collect(hashCommitRef)
	collect(plainCommitRef)
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].at < hits[j].at })

	var out []CommitRef
	seen := map[string]bool{}
	for _, hit := range hits {
		key := hit.ref.Slug + "#" + strconv.Itoa(hit.ref.Number)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, hit.ref)
	}
	return out
}

// MatchExplicitTasks resolves citations against active cards. A removed card,
// a dropped task, or an unknown slug or number is ignored.
func MatchExplicitTasks(subject string, cards []work.Card) []work.Task {
	var out []work.Task
	seen := map[string]bool{}
	for _, ref := range ParseCommitRefs(subject) {
		task, ok := explicitTask(cards, ref)
		if !ok || seen[task.ID] {
			continue
		}
		seen[task.ID] = true
		out = append(out, task)
	}
	return out
}

func explicitTask(cards []work.Card, ref CommitRef) (work.Task, bool) {
	for _, card := range cards {
		if card.Status == work.CardRemoved || card.Slug != ref.Slug {
			continue
		}
		for _, task := range card.Tasks {
			if task.Number == ref.Number && task.State != work.TaskDropped {
				return task, true
			}
		}
	}
	return work.Task{}, false
}
