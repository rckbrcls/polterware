import { vi } from "vitest";
import type { SettingsBridge, SettingsJSON, AgentInfoJSON, ActivityJSON, DoctorCheckJSON } from "./model";
import { DEFAULT_SETTINGS } from "./model";
import { mcpSnippets } from "./snippets";

const VALID_THEMES = new Set(["system", "dark", "light"]);
const VALID_PROVIDERS = new Set(["", "openfreemap", "pmtiles"]);
const VALID_WEEK = new Set(["mon", "sun"]);

function validate(key: string, next: SettingsJSON): string | undefined {
  if (key === "appearance.theme" && !VALID_THEMES.has(next.appearanceTheme ?? "")) return "unknown theme";
  if (key === "notifications.allDayTime") {
    const value = next.notificationsAllDayTime ?? "";
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return "must be HH:MM";
  }
  if (key === "notifications.snoozeMinutes") {
    const value = next.notificationsSnoozeMinutes ?? 0;
    if (value < 1 || value > 1440) return "must be between 1 and 1440";
  }
  if (key === "focus.work" && ((next.focusWorkMin ?? 0) < 1 || (next.focusWorkMin ?? 0) > 60)) return "must be between 1 and 60";
  if (key === "focus.shortBreak" && ((next.focusShortBreakMin ?? 0) < 1 || (next.focusShortBreakMin ?? 0) > 60)) return "must be between 1 and 60";
  if (key === "focus.longBreak" && ((next.focusLongBreakMin ?? 0) < 1 || (next.focusLongBreakMin ?? 0) > 60)) return "must be between 1 and 60";
  if (key === "focus.cycles" && ((next.focusCycles ?? 0) < 1 || (next.focusCycles ?? 0) > 12)) return "must be between 1 and 12";
  if (key === "agents.mcpPort" && ((next.agentsMcpPort ?? 0) < 1 || (next.agentsMcpPort ?? 0) > 65535)) return "must be between 1 and 65535";
  if (key === "calendar.weekStart" && !VALID_WEEK.has(next.calendarWeekStart ?? "")) return "must be mon or sun";
  if (key === "map.provider" && !VALID_PROVIDERS.has(next.mapProvider ?? "")) return "unknown map provider";
}

function snippetsFor(port: number, token: string) {
  const generated = mcpSnippets({ port, token });
  return {
    claudeStdio: generated.claudeStdio,
    claudeHttp: generated.claudeHttp,
    cursorStdioJson: generated.cursorStdioJson,
    cursorHttpJson: generated.cursorHttpJson,
  };
}

export function fakeSettingsBridge(seed: Partial<SettingsJSON> = {}) {
  const settings: SettingsJSON = { ...DEFAULT_SETTINGS, ...seed, appearanceTheme: "dark" };
  const valid = new Set<string>(["live-token"]);
  let token = "live-token";
  let tokenPresent = true;
  const activity: ActivityJSON[] = [
    { id: "activity-1", at: "2026-10-04T12:00:00.000Z", actor: "mcp:Claude Code", entity: "note", entityId: "note-1", op: "update", summary: "Updated note title" },
    { id: "activity-2", at: "2026-10-04T11:00:00.000Z", actor: "ui", entity: "settings", entityId: "map.online", op: "update", summary: "Update setting" },
  ];
  const doctor: DoctorCheckJSON[] = [
    { name: "sqlite", ok: true, detail: "ok" },
    { name: "mcp-token", ok: true, detail: "token presence (value omitted)" },
  ];
  let ftsDocuments = 12;
  let permission = "not_determined";
  let reduceTransparency = false;
  let listener: Parameters<SettingsBridge["onChange"]>[0] | undefined;
  const emit = (entity: string, id: string) => listener?.({ resync: false, changes: [{ entity, id, op: "update" }] });

  function info(): AgentInfoJSON {
    const extras = snippetsFor(settings.agentsMcpPort ?? 47600, token);
    return {
      mcpPort: settings.agentsMcpPort,
      tokenPresent,
      token,
      enabled: settings.agentsMcpEnabled,
      allowFileAttach: settings.agentsAllowFileAttach,
      ...extras,
    };
  }

  const bridge: SettingsBridge = {
    settings: {
      get: vi.fn(async () => ({ settings: { ...settings } })),
      set: vi.fn(async input => {
        const keys = input?.keys ?? [];
        if (!keys.length) throw Object.assign(new Error("invalid argument"), { details: [{ field: "keys", reason: "required" }] });
        const seen = new Set<string>();
        for (const key of keys) {
          if (seen.has(key)) throw Object.assign(new Error("unknown or duplicate setting"), { details: [{ field: key, reason: "unknown or duplicate setting" }] });
          seen.add(key);
          const next = { ...settings, ...input?.settings };
          const reason = validate(key, next);
          if (reason) throw Object.assign(new Error(reason), { details: [{ field: key, reason }] });
          Object.assign(settings, input?.settings, { appearanceTheme: "dark" });
        }
        emit("settings", keys[0] ?? "settings");
        return { settings: { ...settings } };
      }),
    },
    agents: {
      getInfo: vi.fn(async () => info()),
      rotateToken: vi.fn(async () => {
        valid.delete(token);
        token = `rotated-${valid.size + 1}`;
        valid.add(token);
        tokenPresent = true;
        emit("agent", "mcp-token");
        return { token };
      }),
      setEnabled: vi.fn(async input => {
        settings.agentsMcpEnabled = input?.enabled ?? false;
        emit("settings", "agents.mcpEnabled");
        return { enabled: settings.agentsMcpEnabled };
      }),
      setAllowFileAttach: vi.fn(async input => {
        settings.agentsAllowFileAttach = input?.allow ?? false;
        emit("settings", "agents.allowFileAttach");
        return { allow: settings.agentsAllowFileAttach };
      }),
    },
    reminders: {
      plan: vi.fn(async () => ({ items: [] })),
      ack: vi.fn(async () => ({})),
      snooze: vi.fn(async () => ({})),
      armOneOff: vi.fn(async () => ({})),
      cancelOneOff: vi.fn(async () => ({})),
      heartbeat: vi.fn(async () => ({})),
      status: vi.fn(async () => ({ planned: 2, armed: permission === "authorized" ? 2 : 0, permission, notifierLastSeenAt: permission === "authorized" ? "2026-10-04T12:00:00.000Z" : undefined })),
    },
    search: {
      search: vi.fn(async () => ({ hits: [] })),
      status: vi.fn(async () => ({ ftsDocuments })),
      reindex: vi.fn(async () => {
        ftsDocuments = 24;
        emit("search", "fts");
        return { notes: ftsDocuments };
      }),
    },
    activity: {
      list: vi.fn(async input => {
        const actor = input?.actor ?? "";
        const events = activity.filter(event => !actor || event.actor === actor);
        return { events: events.map(event => ({ ...event })), nextCursor: "" };
      }),
    },
    maintenance: {
      export: vi.fn(async input => ({ zipPath: input?.zipPath ?? "", bytes: "128" })),
      backup: vi.fn(async input => ({ path: input?.destPath ?? "", bytes: "256" })),
      doctor: vi.fn(async () => ({ ok: doctor.every(check => check.ok), checks: doctor.map(check => ({ ...check })) })),
    },
    onChange: vi.fn(callback => { listener = callback; return () => { listener = undefined; }; }),
    app: {
      openLog: vi.fn(async () => {}),
      openDataFolder: vi.fn(async () => {}),
      getReduceTransparency: vi.fn(async () => reduceTransparency),
      setReduceTransparency: vi.fn(async enabled => { reduceTransparency = enabled; return reduceTransparency; }),
      testMcpConnection: vi.fn(async () => settings.agentsMcpEnabled
        ? { ok: true, toolCount: 2 }
        : { ok: false, error: "MCP is off. Enable it in Agents > Access, then test again." }),
      getInfo: vi.fn(async () => ({ name: "Polterware Notes", version: "0.1.0", updates: "disabled" as const })),
      requestNotificationAuthorization: vi.fn(async () => {
        permission = "authorized";
        return true;
      }),
      saveZip: vi.fn(async () => "/tmp/notes-export.zip"),
      saveBackup: vi.fn(async () => "/tmp/notes-backup.db"),
    },
  };

  return {
    bridge,
    settings,
    valid,
    token: () => token,
    setPermission: (value: string) => { permission = value; },
    setToken: (value: string) => { token = value; tokenPresent = Boolean(value); },
    emit,
  };
}
