import type { DescService, JsonValue } from "@bufbuild/protobuf";
import { fromJson } from "@bufbuild/protobuf";
import * as Contracts from "@polterware/notes-contracts";
import type { SearchBridge } from "./model";

type WireNamespace = Record<string, (input?: JsonValue) => Promise<JsonValue>>;

/** Structural subset of window.pwnotes. Feature packages must not declare Window.pwnotes. */
export type SearchWireBridge = {
  search: WireNamespace;
  spaces: WireNamespace;
  tags: WireNamespace;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: SearchBridge["app"];
};

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
  return result as SearchBridge["search"];
}

export function createSearchBridge(wire: SearchWireBridge): SearchBridge {
  return {
    search: bind(wire.search, Contracts.SearchService) as SearchBridge["search"],
    spaces: bind(wire.spaces, Contracts.SpaceService) as unknown as SearchBridge["spaces"],
    tags: bind(wire.tags, Contracts.TagService) as unknown as SearchBridge["tags"],
    onChange: callback => wire.onChange(callback),
    app: wire.app,
  };
}

/** Reads the preload wire without augmenting Window. Polterware Notes Desktop owns that type. */
export function browserBridge(): SearchBridge {
  const wire = Reflect.get(globalThis, "pwnotes") as SearchWireBridge | undefined;
  if (!wire?.search) throw new Error("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
  return createSearchBridge(wire);
}

export async function openSearchPage(): Promise<void> {
  const wire = Reflect.get(globalThis, "pwnotes") as { app?: { openDeepLink?: (url: string) => Promise<void> } } | undefined;
  await wire?.app?.openDeepLink?.("pwnotes://search");
}
