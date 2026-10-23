// Package review derives streaks, contribution days, and mood from completions and focus.
package review

import "time"

const (
	MoodSad      = "sad"
	MoodHopeful  = "hopeful"
	MoodHappy    = "happy"
	MoodEuphoric = "euphoric"

	// Streak thresholds: 0 sad, 1–6 hopeful, 7–29 happy, ≥30 euphoric.
	StreakHopefulMin  = 1
	StreakHappyMin    = 7
	StreakEuphoricMin = 30

	// Completed-count thresholds: 0 sad, 1–24 hopeful, 25–99 happy, ≥100 euphoric.
	CompletedHopefulMin  = 1
	CompletedHappyMin    = 25
	CompletedEuphoricMin = 100
)

// Day is one civil date in the requested zone.
// Periods are morning 06–12, afternoon 12–18, evening 18–22, and night otherwise.
type Day struct {
	Date         string
	Completed    int
	Morning      int
	Afternoon    int
	Evening      int
	Night        int
	FocusMinutes int
}

// Report is ReviewService.Get. Contribution is the 12 months ending at To.
type Report struct {
	From           time.Time
	To             time.Time
	TZ             string
	Streak         int
	CompletedTotal int
	FocusMinutes   int
	StreakMood     string
	CompletedMood  string
	Days           []Day
	Contribution   []Day
}

// Completion is one completed occurrence instant.
type Completion struct {
	NoteID string
	At     time.Time
}

// FocusSpan is elapsed focus time inside the range.
type FocusSpan struct {
	StartedAt time.Time
	ElapsedS  int
}
