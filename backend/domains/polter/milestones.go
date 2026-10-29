package polter

import (
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/work"
)

// EncodeMilestones lists the listed milestones in order with their state,
// delivered/total cards, and target date, then the Backlog count.
func EncodeMilestones(snapshot work.Snapshot) string {
	var b strings.Builder
	for _, milestone := range work.OrderMilestones(snapshot.Milestones) {
		if milestone.ArchivedAt != "" {
			continue
		}
		cards := milestoneCards(snapshot, milestone.ID)
		fmt.Fprintf(&b, "%s  %s  %d/%d delivered", milestone.Slug, milestone.State, delivered(cards), len(cards))
		if milestone.TargetDate != "" {
			b.WriteString("  target " + milestone.TargetDate)
		}
		fmt.Fprintf(&b, "  %q\n", milestone.Name)
	}
	if b.Len() == 0 {
		b.WriteString("No milestones. Create one in the Desktop Work page.\n")
	}
	fmt.Fprintf(&b, "backlog  %d cards\n", len(milestoneCards(snapshot, "")))
	return b.String()
}

// EncodeRoadmap renders each active milestone in order: its goal, exit
// criteria, card count per stage, and the cards still open.
func EncodeRoadmap(snapshot work.Snapshot) string {
	var b strings.Builder
	for _, milestone := range work.OrderMilestones(snapshot.Milestones) {
		if milestone.ArchivedAt != "" || milestone.State != work.MilestoneActive {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		fmt.Fprintf(&b, "## %s: %s\n", milestone.Slug, milestone.Name)
		if milestone.TargetDate != "" {
			fmt.Fprintf(&b, "target: %s\n", milestone.TargetDate)
		}
		if milestone.Goal != "" {
			fmt.Fprintf(&b, "goal: %s\n", milestone.Goal)
		}
		for _, line := range milestone.ExitCriteria {
			fmt.Fprintf(&b, "exit: %s\n", line)
		}
		cards := milestoneCards(snapshot, milestone.ID)
		if len(cards) == 0 {
			b.WriteString("cards: none yet\n")
			continue
		}
		var counts []string
		for _, stage := range work.Stages {
			n := 0
			for _, card := range cards {
				if card.Stage == stage {
					n++
				}
			}
			if n > 0 {
				counts = append(counts, fmt.Sprintf("%d %s", n, stage))
			}
		}
		fmt.Fprintf(&b, "cards: %s\n", strings.Join(counts, " · "))
		for _, card := range cards {
			if card.Stage != work.StageDelivered {
				fmt.Fprintf(&b, "- %s  %s  %q\n", card.Slug, card.Stage, card.Title)
			}
		}
	}
	if b.Len() == 0 {
		b.WriteString("No active milestones. List them with polterware query milestones.\n")
	}
	fmt.Fprintf(&b, "\nBacklog: %d cards\n", len(milestoneCards(snapshot, "")))
	return b.String()
}

// milestoneCards are the active cards in milestoneID; "" is the Backlog. A card
// whose milestone is archived stays with it.
func milestoneCards(snapshot work.Snapshot, milestoneID string) []work.Card {
	var out []work.Card
	for _, card := range snapshot.Cards {
		if card.Status == work.CardActive && card.MilestoneID == milestoneID {
			out = append(out, card)
		}
	}
	return out
}

func delivered(cards []work.Card) int {
	n := 0
	for _, card := range cards {
		if card.Stage == work.StageDelivered {
			n++
		}
	}
	return n
}
