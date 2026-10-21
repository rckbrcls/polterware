import type { DescService, JsonValue } from "@bufbuild/protobuf";
import { fromJson } from "@bufbuild/protobuf";
import * as Contracts from "@polterware/notes-contracts";

type Rpc = (input?: JsonValue) => Promise<JsonValue>;
type WireNamespace = Record<string, Rpc>;

/** Structural subset of window.pwnotes. Feature packages must not declare Window.pwnotes. */
export type ScheduleWireBridge = {
  notes: WireNamespace;
  schedule: WireNamespace;
  reminders: WireNamespace;
  settings: WireNamespace;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
};

export type ScheduleBridge = {
  notes: { get: Rpc };
  schedule: {
    set: Rpc;
    clear: Rpc;
    preview: Rpc;
    completeOccurrence: Rpc;
    reopenOccurrence: Rpc;
    setFocusRecipe: Rpc;
  };
  reminders: { status: Rpc; snooze: Rpc };
  settings: { get: Rpc };
  onChange: ScheduleWireBridge["onChange"];
};

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as JsonValue;
}

export function revisionString(rev: string | number | bigint | undefined): string {
  if (typeof rev === "string" && rev !== "") return rev;
  if (typeof rev === "bigint") return rev.toString();
  if (typeof rev === "number" && Number.isFinite(rev)) return Math.trunc(rev).toString();
  return "0";
}

function withStringRev(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("expectedRev" in value) || value.expectedRev == null) return value;
  return { ...value, expectedRev: revisionString(value.expectedRev as string | number | bigint | undefined) };
}

function bind(source: WireNamespace, service: DescService): WireNamespace {
  const result: WireNamespace = {};
  for (const method of service.methods) {
    result[method.localName] = async (input = {}) => {
      const request = withStringRev(jsonValue(input ?? {}));
      fromJson(method.input, request, { ignoreUnknownFields: true });
      const json = jsonValue(await source[method.localName]!(request));
      fromJson(method.output, json, { ignoreUnknownFields: true });
      return json;
    };
  }
  return result;
}

export function createScheduleBridge(wire: ScheduleWireBridge): ScheduleBridge {
  return {
    notes: bind(wire.notes, Contracts.NoteService) as ScheduleBridge["notes"],
    schedule: bind(wire.schedule, Contracts.ScheduleService) as ScheduleBridge["schedule"],
    reminders: bind(wire.reminders, Contracts.ReminderService) as ScheduleBridge["reminders"],
    settings: bind(wire.settings, Contracts.SettingsService) as ScheduleBridge["settings"],
    onChange: callback => wire.onChange(callback),
  };
}

/** Reads the preload wire without augmenting Window. Polterware Notes Desktop owns that type. */
export function browserBridge(): ScheduleBridge {
  const wire = Reflect.get(globalThis, "pwnotes") as ScheduleWireBridge | undefined;
  if (!wire?.schedule || !wire.reminders) throw new Error("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
  return createScheduleBridge(wire);
}
