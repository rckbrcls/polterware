import type { DescMethodUnary, DescService, JsonValue, MessageJsonType, MessageShape } from "@bufbuild/protobuf";
import { fromJson } from "@bufbuild/protobuf";
import * as Contracts from "@polterware/notes-contracts";

type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: MessageJsonType<S["method"][K]["input"]>) => Promise<MessageShape<S["method"][K]["output"]>>
    : never;
};
/** Structural subset of window.pwnotes. No renderer transport or application imports. */
export type ShellBridge = {
  notes: Namespace<typeof Contracts.NoteService>;
  spaces: Namespace<typeof Contracts.SpaceService>;
  tags: Namespace<typeof Contracts.TagService>;
  reminders: Namespace<typeof Contracts.ReminderService>;
  search: Namespace<typeof Contracts.SearchService>;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: {
    onDeepLink(callback: (link: { url: string; route: string }) => void): () => void;
    getDeepLink(): Promise<{ url: string; route: string } | null>;
    requestNotificationAuthorization(): Promise<boolean>;
  };
};

/** The frozen bridge returns protobuf JSON; validate it once before feature code reads fields. */
export type ShellWireBridge = Omit<ShellBridge, "notes" | "spaces" | "tags" | "reminders" | "search"> & {
  [K in "notes" | "spaces" | "tags" | "reminders" | "search"]: {
    [M in keyof ShellBridge[K]]: (input?: JsonValue) => Promise<JsonValue>;
  };
};

function bind<S extends DescService>(source: Record<string, (input?: JsonValue) => Promise<JsonValue>>, service: S): Namespace<S> {
  const result: Record<string, (input?: JsonValue) => Promise<unknown>> = {};
  for (const method of service.methods) {
    result[method.localName] = async (input = {}) => fromJson(method.output, await source[method.localName]!(input));
  }
  return result as Namespace<S>;
}
export function createShellBridge(wire: ShellWireBridge): ShellBridge {
  return {
    ...wire,
    notes: bind(wire.notes, Contracts.NoteService),
    spaces: bind(wire.spaces, Contracts.SpaceService),
    tags: bind(wire.tags, Contracts.TagService),
    reminders: bind(wire.reminders, Contracts.ReminderService),
    search: bind(wire.search, Contracts.SearchService),
  };
}
