import type { DescService, JsonValue } from "@bufbuild/protobuf";
import { fromJson } from "@bufbuild/protobuf";
import * as Contracts from "@polterware/notes-contracts";
import { revisionString, type NotesBridge } from "./model";

type WireNamespace = Record<string, (input?: JsonValue) => Promise<JsonValue>>;

/** Structural subset of window.pwnotes. Feature packages must not declare Window.pwnotes. */
export type NotesWireBridge = {
  notes: WireNamespace;
  spaces: WireNamespace;
  tags: WireNamespace;
  activity: WireNamespace;
  schedule: WireNamespace;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: NotesBridge["app"];
};

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as JsonValue;
}
function withStringRev(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("expectedRev" in value) || value.expectedRev == null) return value;
  return { ...value, expectedRev: revisionString(value.expectedRev as string | number | bigint | undefined) };
}
function bind<S extends DescService>(source: WireNamespace, service: S): NotesBridge["notes"] {
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
  return result as NotesBridge["notes"];
}

export function createNotesBridge(wire: NotesWireBridge): NotesBridge {
  return {
    notes: bind(wire.notes, Contracts.NoteService),
    spaces: bind(wire.spaces, Contracts.SpaceService) as unknown as NotesBridge["spaces"],
    tags: bind(wire.tags, Contracts.TagService) as unknown as NotesBridge["tags"],
    activity: bind(wire.activity, Contracts.ActivityService) as unknown as NotesBridge["activity"],
    schedule: bind(wire.schedule, Contracts.ScheduleService) as unknown as NotesBridge["schedule"],
    onChange: callback => wire.onChange(callback),
    app: wire.app,
  };
}

/** Reads the preload wire without augmenting Window. Polterware Notes Desktop owns that type. */
export function browserBridge(): NotesBridge {
  const wire = Reflect.get(globalThis, "pwnotes") as NotesWireBridge | undefined;
  if (!wire?.notes) throw new Error("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
  return createNotesBridge(wire);
}

export { revisionString };
export type { NotesBridge };
