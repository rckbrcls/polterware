// Package settings is the typed settings document stored as key/value JSON.
package settings

import "github.com/polterware/polterware/notes/backend/domains/focus"

const (
	ThemeSystem = "system"
	ThemeDark   = "dark"
	ThemeLight  = "light"

	KeyAppearanceTheme            = "appearance.theme"
	KeyNotificationsSound         = "notifications.sound"
	KeyNotificationsAllDayTime    = "notifications.allDayTime"
	KeyNotificationsSnoozeMinutes = "notifications.snoozeMinutes"
	KeyFocusWork                  = "focus.work"
	KeyFocusShortBreak            = "focus.shortBreak"
	KeyFocusLongBreak             = "focus.longBreak"
	KeyFocusCycles                = "focus.cycles"
	KeyFocusAutoContinue          = "focus.autoContinue"
	KeyFocusSounds                = "focus.sounds"
	KeyFocusNotifications         = "focus.notifications"
	KeyMapOnline                  = "map.online"
	KeyMapProvider                = "map.provider"
	KeyAgentsMCPPort              = "agents.mcpPort"
	KeyAgentsMCPEnabled           = "agents.mcpEnabled"
	KeyAgentsAllowFileAttach      = "agents.allowFileAttach"
	KeyAppKeepRunningInBackground = "app.keepRunningInBackground"
	KeyLinksFetchTitles           = "links.fetchTitles"
	KeyCalendarWeekStart          = "calendar.weekStart"
	KeyMapGeocoding               = "map.geocoding"

	WeekStartMon = "mon"
	WeekStartSun = "sun"

	DefaultAllDayTime    = "09:00"
	DefaultSnoozeMinutes = 10
	DefaultMCPPort       = 47600
	DefaultTheme         = ThemeDark
)

// Settings is the effective document. Get fills defaults for missing keys.
type Settings struct {
	AppearanceTheme            string
	NotificationsSound         string
	NotificationsAllDayTime    string
	NotificationsSnoozeMinutes int
	FocusWorkMin               int
	FocusShortBreakMin         int
	FocusLongBreakMin          int
	FocusCycles                int
	FocusAutoContinue          bool
	FocusSounds                bool
	FocusNotifications         bool
	MapOnline                  bool
	MapProvider                string
	AgentsMCPPort              int
	AgentsMCPEnabled           bool
	AgentsAllowFileAttach      bool
	AppKeepRunningInBackground bool
	LinksFetchTitles           bool
	CalendarWeekStart          string
	MapGeocoding               bool
}

// Default is the document before any key is stored.
// MapOnline stays false until the first-run disclosure turns it on.
// MCP is enabled on loopback.
func Default() Settings {
	return Settings{
		AppearanceTheme:            DefaultTheme,
		NotificationsAllDayTime:    DefaultAllDayTime,
		NotificationsSnoozeMinutes: DefaultSnoozeMinutes,
		FocusWorkMin:               focus.DefaultWorkMin,
		FocusShortBreakMin:         focus.DefaultShortBreakMin,
		FocusLongBreakMin:          focus.DefaultLongBreakMin,
		FocusCycles:                focus.DefaultCycles,
		FocusAutoContinue:          true,
		FocusSounds:                true,
		FocusNotifications:         true,
		MapOnline:                  false,
		AgentsMCPPort:              DefaultMCPPort,
		AgentsMCPEnabled:           true,
		AgentsAllowFileAttach:      false,
		AppKeepRunningInBackground: true,
		LinksFetchTitles:           false,
		CalendarWeekStart:          WeekStartMon,
	}
}
