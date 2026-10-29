import type { SavedFilterRecord, SavedFiltersApi } from "@polterware/frontend-design-system";

type WireSavedFilters = {
  list: (input: { surface: string }) => Promise<unknown>;
  save: (input: { surface: string; name: string; payloadJson: string }) => Promise<unknown>;
  delete: (input: { id: string }) => Promise<unknown>;
};

function records(response: unknown): SavedFilterRecord[] {
  const filters = (response as { filters?: unknown } | undefined)?.filters;
  if (!Array.isArray(filters)) return [];
  return filters.flatMap((item): SavedFilterRecord[] => {
    const { id, name, payloadJson } = (item ?? {}) as Record<string, unknown>;
    return typeof id === "string" && typeof name === "string"
      ? [{ id, name, payloadJson: typeof payloadJson === "string" ? payloadJson : "{}" }]
      : [];
  });
}

/** Saved filters of one Notes page in the Polterware Notes store, or undefined outside the desktop. */
export function notesSavedFiltersApi(surface: string): SavedFiltersApi | undefined {
  const wire = (Reflect.get(globalThis, "pwnotes") as { savedFilters?: WireSavedFilters } | undefined)?.savedFilters;
  if (!wire) return undefined;
  return {
    list: async () => records(await wire.list({ surface })),
    save: (name, payloadJson) => wire.save({ surface, name, payloadJson }),
    delete: (id) => wire.delete({ id }),
  };
}
