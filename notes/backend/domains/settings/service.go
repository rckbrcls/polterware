package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/activity"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"time"
)

type service struct {
	repo  Repository
	audit activity.Audit
}

func NewService(r Repository, a activity.Audit) Service { return &service{r, a} }
func field(s *Settings, key string) any {
	switch key {
	case KeyAppearanceTheme:
		return &s.AppearanceTheme
	case KeyNotificationsSound:
		return &s.NotificationsSound
	case KeyNotificationsAllDayTime:
		return &s.NotificationsAllDayTime
	case KeyNotificationsSnoozeMinutes:
		return &s.NotificationsSnoozeMinutes
	case KeyFocusWork:
		return &s.FocusWorkMin
	case KeyFocusShortBreak:
		return &s.FocusShortBreakMin
	case KeyFocusLongBreak:
		return &s.FocusLongBreakMin
	case KeyFocusCycles:
		return &s.FocusCycles
	case KeyFocusAutoContinue:
		return &s.FocusAutoContinue
	case KeyFocusSounds:
		return &s.FocusSounds
	case KeyFocusNotifications:
		return &s.FocusNotifications
	case KeyMapOnline:
		return &s.MapOnline
	case KeyMapProvider:
		return &s.MapProvider
	case KeyAgentsMCPPort:
		return &s.AgentsMCPPort
	case KeyAgentsMCPEnabled:
		return &s.AgentsMCPEnabled
	case KeyAgentsAllowFileAttach:
		return &s.AgentsAllowFileAttach
	case KeyAppKeepRunningInBackground:
		return &s.AppKeepRunningInBackground
	case KeyLinksFetchTitles:
		return &s.LinksFetchTitles
	case KeyCalendarWeekStart:
		return &s.CalendarWeekStart
	case KeyMapGeocoding:
		return &s.MapGeocoding
	}
	return nil
}
func validate(s Settings, key string) error {
	switch key {
	case KeyAppearanceTheme:
		if s.AppearanceTheme != ThemeDark && s.AppearanceTheme != ThemeSystem && s.AppearanceTheme != ThemeLight {
			return activity.Invalid(key, "unknown theme")
		}
	case KeyNotificationsAllDayTime:
		t, e := time.Parse("15:04", s.NotificationsAllDayTime)
		if e != nil || t.Format("15:04") != s.NotificationsAllDayTime {
			return activity.Invalid(key, "must be HH:MM")
		}
	case KeyNotificationsSnoozeMinutes:
		if s.NotificationsSnoozeMinutes < 1 || s.NotificationsSnoozeMinutes > 1440 {
			return activity.Invalid(key, "must be between 1 and 1440")
		}
	case KeyFocusWork:
		if s.FocusWorkMin < 1 || s.FocusWorkMin > 60 {
			return activity.Invalid(key, "must be between 1 and 60")
		}
	case KeyFocusShortBreak:
		if s.FocusShortBreakMin < 1 || s.FocusShortBreakMin > 60 {
			return activity.Invalid(key, "must be between 1 and 60")
		}
	case KeyFocusLongBreak:
		if s.FocusLongBreakMin < 1 || s.FocusLongBreakMin > 60 {
			return activity.Invalid(key, "must be between 1 and 60")
		}
	case KeyFocusCycles:
		if s.FocusCycles < 1 || s.FocusCycles > 12 {
			return activity.Invalid(key, "must be between 1 and 12")
		}
	case KeyAgentsMCPPort:
		if s.AgentsMCPPort < 1 || s.AgentsMCPPort > 65535 {
			return activity.Invalid(key, "must be between 1 and 65535")
		}
	case KeyCalendarWeekStart:
		if s.CalendarWeekStart != WeekStartMon && s.CalendarWeekStart != WeekStartSun {
			return activity.Invalid(key, "must be mon or sun")
		}
	case KeyMapProvider:
		if s.MapProvider != "" && s.MapProvider != "openfreemap" && s.MapProvider != "pmtiles" {
			return activity.Invalid(key, "unknown map provider")
		}
	}
	return nil
}
func (s *service) Get(ctx context.Context) (Settings, error) {
	out := Default()
	rows, e := s.repo.List(ctx)
	if e != nil {
		return out, fmt.Errorf("list settings: %w", e)
	}
	for key, raw := range rows {
		p := field(&out, key)
		if p == nil {
			return out, activity.Invalid(key, "unknown setting")
		}
		if raw == "null" {
			return out, activity.Invalid(key, "null is not a typed setting")
		}
		if e = json.Unmarshal([]byte(raw), p); e != nil {
			return out, fmt.Errorf("decode setting %s: %w", key, e)
		}
		if e = validate(out, key); e != nil {
			return out, e
		}
	}
	// Keep legacy values readable without restoring a theme choice.
	out.AppearanceTheme = ThemeDark
	return out, nil
}
func (s *service) Set(ctx context.Context, a actor.Actor, keys []string, next Settings) (out Settings, err error) {
	err = s.audit.Transactions.Within(ctx, func(ctx context.Context) error {
		seen := map[string]bool{}
		for _, key := range keys {
			p := field(&next, key)
			if p == nil || seen[key] {
				return activity.Invalid(key, "unknown or duplicate setting")
			}
			seen[key] = true
			if e := validate(next, key); e != nil {
				return e
			}
			if key == KeyAppearanceTheme {
				next.AppearanceTheme = ThemeDark
			}
			raw, e := json.Marshal(p)
			if e != nil {
				return fmt.Errorf("encode setting: %w", e)
			}
			if e = s.audit.Write(ctx, a, "settings", key, activity.OpUpdate, "Update setting", func(ctx context.Context) error { return s.repo.Set(ctx, key, string(raw)) }); e != nil {
				return e
			}
		}
		var e error
		out, e = s.Get(ctx)
		return e
	})
	return
}
