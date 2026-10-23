package settings_test

import (
	"context"
	"errors"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/settings"
	"testing"
)

func TestTypedSettings(t *testing.T) {
	f := setup()
	got, e := f.SS.Get(f.Ctx)
	check(t, e)
	if got != settings.Default() {
		t.Fatal(got)
	}
	next := settings.Settings{AppearanceTheme: settings.ThemeSystem, NotificationsSound: "bell", NotificationsAllDayTime: "23:59", NotificationsSnoozeMinutes: 1440, FocusWorkMin: 60, FocusShortBreakMin: 1, FocusLongBreakMin: 60, FocusCycles: 12, FocusAutoContinue: false, FocusSounds: false, FocusNotifications: false, MapOnline: true, MapProvider: "openfreemap", AgentsMCPPort: 65535, AgentsMCPEnabled: false, AgentsAllowFileAttach: true, AppKeepRunningInBackground: false, LinksFetchTitles: true, CalendarWeekStart: settings.WeekStartSun, MapGeocoding: true}
	keys := []string{settings.KeyAppearanceTheme, settings.KeyNotificationsSound, settings.KeyNotificationsAllDayTime, settings.KeyNotificationsSnoozeMinutes, settings.KeyFocusWork, settings.KeyFocusShortBreak, settings.KeyFocusLongBreak, settings.KeyFocusCycles, settings.KeyFocusAutoContinue, settings.KeyFocusSounds, settings.KeyFocusNotifications, settings.KeyMapOnline, settings.KeyMapProvider, settings.KeyAgentsMCPPort, settings.KeyAgentsMCPEnabled, settings.KeyAgentsAllowFileAttach, settings.KeyAppKeepRunningInBackground, settings.KeyLinksFetchTitles, settings.KeyCalendarWeekStart, settings.KeyMapGeocoding}
	got, e = f.SS.Set(f.Ctx, actor.CLI(), keys, next)
	check(t, e)
	next.AppearanceTheme = settings.ThemeDark
	if got != next {
		t.Fatal(got)
	}
	got, e = f.SS.Set(f.Ctx, actor.UI(), []string{settings.KeyAppearanceTheme}, settings.Settings{AppearanceTheme: settings.ThemeLight})
	check(t, e)
	if got.AppearanceTheme != settings.ThemeDark || got.FocusWorkMin != 60 {
		t.Fatal(got)
	}
	for _, tc := range []struct {
		key    string
		modify func(*settings.Settings)
	}{{settings.KeyAppearanceTheme, func(s *settings.Settings) { s.AppearanceTheme = "bad" }}, {settings.KeyNotificationsAllDayTime, func(s *settings.Settings) { s.NotificationsAllDayTime = "24:00" }}, {settings.KeyNotificationsAllDayTime, func(s *settings.Settings) { s.NotificationsAllDayTime = "9:00" }}, {settings.KeyNotificationsSnoozeMinutes, func(s *settings.Settings) { s.NotificationsSnoozeMinutes = 0 }}, {settings.KeyNotificationsSnoozeMinutes, func(s *settings.Settings) { s.NotificationsSnoozeMinutes = 1441 }}, {settings.KeyFocusWork, func(s *settings.Settings) { s.FocusWorkMin = 0 }}, {settings.KeyFocusShortBreak, func(s *settings.Settings) { s.FocusShortBreakMin = 61 }}, {settings.KeyFocusLongBreak, func(s *settings.Settings) { s.FocusLongBreakMin = 0 }}, {settings.KeyFocusCycles, func(s *settings.Settings) { s.FocusCycles = 13 }}, {settings.KeyAgentsMCPPort, func(s *settings.Settings) { s.AgentsMCPPort = 0 }}, {settings.KeyAgentsMCPPort, func(s *settings.Settings) { s.AgentsMCPPort = 65536 }}, {settings.KeyMapProvider, func(s *settings.Settings) { s.MapProvider = "bad" }}, {settings.KeyCalendarWeekStart, func(s *settings.Settings) { s.CalendarWeekStart = "tue" }}, {"unknown", func(*settings.Settings) {}}} {
		t.Run(tc.key, func(t *testing.T) {
			bad := next
			tc.modify(&bad)
			_, e := f.SS.Set(f.Ctx, actor.UI(), []string{tc.key}, bad)
			code(t, e, fault.CodeInvalid)
		})
	}
	_, e = f.SS.Set(f.Ctx, actor.UI(), []string{settings.KeyMapOnline, settings.KeyMapOnline}, next)
	code(t, e, fault.CodeInvalid)
}

func TestLegacyThemesUseDark(t *testing.T) {
	for _, theme := range []string{settings.ThemeLight, settings.ThemeSystem, settings.ThemeDark} {
		t.Run(theme, func(t *testing.T) {
			f := setup()
			check(t, f.Settings.Set(f.Ctx, settings.KeyAppearanceTheme, `"`+theme+`"`))
			check(t, f.Settings.Set(f.Ctx, settings.KeyFocusWork, "45"))
			got, e := f.SS.Get(f.Ctx)
			check(t, e)
			if got.AppearanceTheme != settings.ThemeDark || got.FocusWorkMin != 45 {
				t.Fatal(got)
			}
			got, e = f.SS.Set(f.Ctx, actor.UI(), []string{settings.KeyAppearanceTheme}, settings.Settings{AppearanceTheme: theme})
			check(t, e)
			if got.AppearanceTheme != settings.ThemeDark || got.FocusWorkMin != 45 {
				t.Fatal(got)
			}
			raw, ok, e := f.Settings.Get(f.Ctx, settings.KeyAppearanceTheme)
			check(t, e)
			if !ok || raw != `"dark"` {
				t.Fatal(raw, ok)
			}
		})
	}
}

type brokenSettings struct {
	settings.Repository
	method string
	err    error
}

func (r brokenSettings) List(c context.Context) (map[string]string, error) {
	if r.method == "list" {
		return nil, r.err
	}
	return r.Repository.List(c)
}
func (r brokenSettings) Set(c context.Context, key, raw string) error {
	if r.method == "set" {
		return r.err
	}
	return r.Repository.Set(c, key, raw)
}
func TestSettingsCorruptionAndRollback(t *testing.T) {
	for _, tc := range []struct{ key, value string }{{"unknown", "true"}, {settings.KeyFocusWork, "null"}, {settings.KeyFocusWork, "\"bad\""}, {settings.KeyFocusWork, "0"}} {
		f := setup()
		check(t, f.Settings.Set(f.Ctx, tc.key, tc.value))
		_, e := f.SS.Get(f.Ctx)
		if e == nil {
			t.Fatal(tc)
		}
	}
	for _, method := range []string{"list", "set"} {
		f := setup()
		err := errors.New("repository failed")
		s := settings.NewService(brokenSettings{f.Settings, method, err}, f.Audit)
		_, e := s.Set(f.Ctx, actor.UI(), []string{settings.KeyMapOnline}, settings.Settings{MapOnline: true})
		if !errors.Is(e, err) {
			t.Fatal(e)
		}
		got, e := f.SS.Get(f.Ctx)
		check(t, e)
		if got.MapOnline {
			t.Fatal("failed write persisted")
		}
	}
	f := setup()
	_, e := f.SS.Set(f.Ctx, actor.UI(), []string{settings.KeyMapOnline, settings.KeyFocusCycles}, settings.Settings{MapOnline: true, FocusCycles: 0})
	code(t, e, fault.CodeInvalid)
	got, e := f.SS.Get(f.Ctx)
	check(t, e)
	if got.MapOnline {
		t.Fatal("partial write persisted")
	}
}
