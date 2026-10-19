import type { DescService, JsonValue } from "@bufbuild/protobuf";
import { fromJson } from "@bufbuild/protobuf";
import * as Contracts from "@polterware/notes-contracts";
import { revisionString, type AttachmentsBridge } from "./model";

type WireNamespace = Record<string, (input?: JsonValue) => Promise<JsonValue>>;

/** Structural subset of window.pwnotes. Feature packages must not declare Window.pwnotes. */
export type AttachmentsWireBridge = {
  attachments: WireNamespace;
  notes: WireNamespace;
  settings: WireNamespace;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: AttachmentsBridge["app"];
};

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as JsonValue;
}
function withStringRev(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("expectedRev" in value) || value.expectedRev == null) return value;
  return { ...value, expectedRev: revisionString(value.expectedRev as string | number | bigint | undefined) };
}
function bind<S extends DescService>(source: WireNamespace, service: S): Record<string, (input?: JsonValue) => Promise<unknown>> {
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
  return result;
}

export function createAttachmentsBridge(wire: AttachmentsWireBridge): AttachmentsBridge {
  return {
    attachments: bind(wire.attachments, Contracts.AttachmentService) as AttachmentsBridge["attachments"],
    notes: bind(wire.notes, Contracts.NoteService) as AttachmentsBridge["notes"],
    settings: bind(wire.settings, Contracts.SettingsService) as AttachmentsBridge["settings"],
    onChange: callback => wire.onChange(callback),
    app: wire.app,
  };
}

/** Reads the preload wire without augmenting Window. Polterware Notes Desktop owns that type. */
export function browserBridge(): AttachmentsBridge {
  const wire = Reflect.get(globalThis, "pwnotes") as AttachmentsWireBridge | undefined;
  if (!wire?.attachments) throw new Error("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
  return createAttachmentsBridge(wire);
}

export { revisionString };
export type { AttachmentsBridge };
