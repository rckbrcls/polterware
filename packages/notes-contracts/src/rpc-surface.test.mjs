import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const protoDir = new URL("../../../notes/schemas/notes/v1/", import.meta.url);

const expected = {
  HealthService: ["Check"],
  SpaceService: ["List", "Get", "Create", "Update", "Delete", "Reorder"],
  NoteService: [
    "List",
    "Get",
    "Create",
    "Update",
    "Delete",
    "SetStatus",
    "SetPinned",
    "Reorder",
    "ToggleCheckItem",
    "ReplaceChecklist",
    "SetTags",
    "BulkAction",
  ],
  TagService: ["List", "Create", "Update", "Delete", "Merge"],
  ScheduleService: ["Set", "Clear", "Preview", "ListOccurrences", "CompleteOccurrence", "ReopenOccurrence", "SetFocusRecipe"],
  PlaceService: ["Set", "Clear", "ListInBounds"],
  AttachmentService: ["ImportFromPath", "AddLink", "List", "Delete", "Reorder", "OpenInfo"],
  FocusService: ["GetDefaults", "SetDefaults", "RecordSession", "ListSessions"],
  ReviewService: ["Get"],
  SearchService: ["Search", "Status", "Reindex"],
  ReminderService: ["Plan", "Ack", "Snooze", "ArmOneOff", "CancelOneOff", "Heartbeat", "Status"],
  ActivityService: ["List"],
  SettingsService: ["Get", "Set"],
  AgentAccessService: ["GetInfo", "RotateToken", "SetEnabled", "SetAllowFileAttach"],
  ChangeService: ["Watch"],
  MaintenanceService: ["Export", "Backup", "Doctor"],
};

function rpcs(source) {
  const found = {};
  let service = "";
  for (const line of source.split("\n")) {
    const serviceMatch = line.match(/^service (\w+)/);
    if (serviceMatch) service = serviceMatch[1];
    const rpcMatch = line.match(/^\s*rpc (\w+)\(/);
    if (rpcMatch && service) {
      found[service] ??= [];
      found[service].push(rpcMatch[1]);
    }
  }
  return found;
}

describe("RPC surface", () => {
  it("keeps search and settings fields within the text-search contract", () => {
    const fields = (file, message) => {
      const source = readFileSync(new URL(file, protoDir), "utf8");
      const body = source.match(new RegExp(`message ${message} \\{([\\s\\S]*?)\\}`))[1];
      return [...body.matchAll(/^\s*(?:repeated )?\w+ (\w+) = \d+;/gm)].map((match) => match[1]);
    };
    expect(fields("search.proto", "SearchNotesRequest")).toEqual([
      "query", "space_id", "include_descendants", "tag_ids", "status", "limit",
    ]);
    expect(fields("search.proto", "SearchNotesResponse")).toEqual(["hits", "notice"]);
    expect(fields("search.proto", "SearchStatusResponse")).toEqual(["fts_documents"]);
    expect(fields("settings.proto", "Settings")).toEqual([
      "appearance_theme", "notifications_sound", "notifications_all_day_time", "notifications_snooze_minutes",
      "focus_work_min", "focus_short_break_min", "focus_long_break_min", "focus_cycles", "focus_auto_continue",
      "focus_sounds", "focus_notifications", "map_online", "map_provider", "agents_mcp_port",
      "agents_mcp_enabled", "agents_allow_file_attach", "app_keep_running_in_background", "links_fetch_titles", "calendar_week_start", "map_geocoding",
    ]);
  });

  it("declares every service method from the data contract", () => {
    const found = {};
    for (const name of readdirSync(protoDir)) {
      if (!name.endsWith(".proto")) continue;
      const part = rpcs(readFileSync(new URL(name, protoDir), "utf8"));
      Object.assign(found, part);
    }
    expect(found).toEqual(expected);
  });
});
