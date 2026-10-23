import type { DescMessage, DescMethodUnary, DescService, JsonValue, MessageShape as ContractMessage } from "@bufbuild/protobuf";
import { fromJson } from "@bufbuild/protobuf";
import * as Contracts from "@polterware/notes-contracts";

type Wire<T> = T extends { $typeName: "google.protobuf.Timestamp" } ? string
  : T extends bigint ? string
  : T extends readonly (infer V)[] ? Wire<V>[]
  : T extends object ? { [K in keyof T as K extends "$typeName" ? never : K]?: Wire<T[K]> }
  : T;
export type JsonOf<S extends DescMessage> = Wire<ContractMessage<S>>;
type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: Wire<ContractMessage<S["method"][K]["input"]>>) => Promise<Wire<ContractMessage<S["method"][K]["output"]>>> : never;
};

type WireNamespace = Record<string, (input?: JsonValue) => Promise<JsonValue>>;

/** Structural subset of window.pwnotes. Feature packages must not declare Window.pwnotes. */
export type FocusWireBridge = {
  focus: WireNamespace;
  reminders: WireNamespace;
  settings: WireNamespace;
  notes: WireNamespace;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
};

export type FocusBridge = {
  focus: Namespace<typeof Contracts.FocusService>;
  reminders: Namespace<typeof Contracts.ReminderService>;
  settings: Namespace<typeof Contracts.SettingsService>;
  notes: Namespace<typeof Contracts.NoteService>;
  onChange: FocusWireBridge["onChange"];
};

export type FocusSessionJSON = JsonOf<typeof Contracts.FocusSessionSchema>;
export type FocusDefaultsJSON = JsonOf<typeof Contracts.FocusDefaultsSchema>;
export type SettingsJSON = JsonOf<typeof Contracts.SettingsSchema>;
export type NoteJSON = JsonOf<typeof Contracts.NoteSchema>;
export type ScheduleJSON = NonNullable<NoteJSON["schedule"]>;

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as JsonValue;
}

function bind<S extends DescService>(source: WireNamespace, service: S) {
  const result: Record<string, (input?: JsonValue) => Promise<unknown>> = {};
  for (const method of service.methods) {
    result[method.localName] = async (input = {}) => {
      const request = jsonValue(input ?? {});
      fromJson(method.input, request, { ignoreUnknownFields: true });
      const json = jsonValue(await source[method.localName]!(request));
      fromJson(method.output, json, { ignoreUnknownFields: true });
      return json;
    };
  }
  return result as Namespace<S>;
}

export function createFocusBridge(wire: FocusWireBridge): FocusBridge {
  return {
    focus: bind(wire.focus, Contracts.FocusService),
    reminders: bind(wire.reminders, Contracts.ReminderService),
    settings: bind(wire.settings, Contracts.SettingsService),
    notes: bind(wire.notes, Contracts.NoteService),
    onChange: callback => wire.onChange(callback),
  };
}

/** Reads the preload wire without augmenting Window. Polterware Notes Desktop owns that type. */
export function browserBridge(): FocusBridge {
  const wire = Reflect.get(globalThis, "pwnotes") as FocusWireBridge | undefined;
  if (!wire?.focus || !wire.reminders || !wire.settings || !wire.notes) {
    throw new Error("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
  }
  return createFocusBridge(wire);
}

export const FOCUS_PHASE_KIND = "focus_phase";
