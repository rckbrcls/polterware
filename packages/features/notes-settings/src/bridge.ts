import type { DescService, JsonValue } from "@bufbuild/protobuf";
import { fromJson } from "@bufbuild/protobuf";
import * as Contracts from "@polterware/notes-contracts";
import type { SettingsBridge } from "./model";

type WireNamespace = Record<string, (input?: JsonValue) => Promise<JsonValue>>;

/** Structural subset of window.pwnotes. Feature packages must not declare Window.pwnotes. */
export type SettingsWireBridge = {
  settings: WireNamespace;
  agents: WireNamespace;
  reminders: WireNamespace;
  search: WireNamespace;
  activity: WireNamespace;
  maintenance: WireNamespace;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: SettingsBridge["app"];
};

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as JsonValue;
}

function withStringRev(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("expectedRev" in value) || value.expectedRev == null) return value;
  return { ...value, expectedRev: String(value.expectedRev) };
}

function bind<S extends DescService>(source: WireNamespace, service: S) {
  const result: Record<string, (input?: JsonValue) => Promise<unknown>> = {};
  for (const method of service.methods) {
    result[method.localName] = async (input = {}) => {
      const request = withStringRev(jsonValue(input ?? {}));
      fromJson(method.input, request, { ignoreUnknownFields: true });
      const json = jsonValue(await source[method.localName]!(request));
      fromJson(method.output, json, { ignoreUnknownFields: true });
      return json;
    };
  }
  return result as SettingsBridge["settings"];
}

export function createSettingsBridge(wire: SettingsWireBridge): SettingsBridge {
  return {
    settings: bind(wire.settings, Contracts.SettingsService) as SettingsBridge["settings"],
    agents: bind(wire.agents, Contracts.AgentAccessService) as unknown as SettingsBridge["agents"],
    reminders: bind(wire.reminders, Contracts.ReminderService) as unknown as SettingsBridge["reminders"],
    search: bind(wire.search, Contracts.SearchService) as unknown as SettingsBridge["search"],
    activity: bind(wire.activity, Contracts.ActivityService) as unknown as SettingsBridge["activity"],
    maintenance: bind(wire.maintenance, Contracts.MaintenanceService) as unknown as SettingsBridge["maintenance"],
    onChange: callback => wire.onChange(callback),
    app: wire.app,
  };
}

/** Reads the preload wire without augmenting Window. Polterware Notes Desktop owns that type. */
export function browserBridge(): SettingsBridge {
  const wire = Reflect.get(globalThis, "pwnotes") as SettingsWireBridge | undefined;
  if (!wire?.settings || !wire.agents || !wire.reminders || !wire.search || !wire.activity || !wire.maintenance || !wire.app) {
    throw new Error("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
  }
  return createSettingsBridge(wire);
}
