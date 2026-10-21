// Package focus is the pomodoro defaults and recorded sessions.
package focus

import "time"

const (
	PhaseWork       = "work"
	PhaseShortBreak = "short_break"
	PhaseLongBreak  = "long_break"

	StateCompleted = "completed"
	StateStopped   = "stopped"

	MinMinutes = 1
	MaxMinutes = 60
	MinCycles  = 1
	MaxCycles  = 12

	DefaultWorkMin       = 25
	DefaultShortBreakMin = 5
	DefaultLongBreakMin  = 15
	DefaultCycles        = 4
)

// Defaults are the global pomodoro settings.
type Defaults struct {
	WorkMin       int
	ShortBreakMin int
	LongBreakMin  int
	Cycles        int
	AutoContinue  bool
	Sounds        bool
	Notifications bool
}

// Session is one finished or stopped focus phase.
type Session struct {
	ID        string
	NoteID    *string
	Phase     string
	PlannedS  int
	ElapsedS  int
	State     string
	StartedAt time.Time
	EndedAt   time.Time
}

// DefaultDefaults is the Swift recipe: 25/5/15, 4 cycles, auto-continue, sounds, and notifications on.
func DefaultDefaults() Defaults {
	return Defaults{
		WorkMin:       DefaultWorkMin,
		ShortBreakMin: DefaultShortBreakMin,
		LongBreakMin:  DefaultLongBreakMin,
		Cycles:        DefaultCycles,
		AutoContinue:  true,
		Sounds:        true,
		Notifications: true,
	}
}
