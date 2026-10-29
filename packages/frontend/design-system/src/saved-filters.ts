import { createEffect, createSignal, on } from "solid-js";
import {
  parseFilterPayload,
  serializeFilterPayload,
  type FilterClause,
  type SavedFilter,
  type SavedFiltersController,
} from "./filter-model";

/** A stored saved filter as the host's store returns it. */
export type SavedFilterRecord = { id: string; name: string; payloadJson: string };

/** Host adapter over the app's store (Polterware core or Polterware Notes core). */
export type SavedFiltersApi = {
  list: () => Promise<readonly SavedFilterRecord[]>;
  save: (name: string, payloadJson: string) => Promise<unknown>;
  delete: (id: string) => Promise<unknown>;
};

export type CreateSavedFiltersOptions = {
  /** Undefined while the store is unavailable (no saved filters are offered). */
  api: () => SavedFiltersApi | undefined;
  /** Current filter, saved by Save. */
  clauses: () => readonly FilterClause[];
  /** Page state saved alongside the clauses (for example a search query). */
  extra?: () => Record<string, unknown> | undefined;
  onApply: (clauses: FilterClause[], extra?: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};

function toSaved(record: SavedFilterRecord): SavedFilter {
  const payload = parseFilterPayload(record.payloadJson);
  return { id: record.id, name: record.name, clauses: payload.clauses, ...(payload.extra ? { extra: payload.extra } : {}) };
}

/**
 * Loads a page's saved filters and returns the controller `FilterPopover` and
 * `ActiveFilterBar` take. It reloads whenever the adapter changes (another project or
 * surface) and after every save or delete.
 */
export function createSavedFilters(options: CreateSavedFiltersOptions): () => SavedFiltersController | undefined {
  const [items, setItems] = createSignal<SavedFilter[]>([]);
  let generation = 0;

  const fail = (error: unknown) => options.onError?.(error instanceof Error ? error.message : String(error));

  const reload = async () => {
    const api = options.api();
    const current = ++generation;
    if (!api) {
      setItems([]);
      return;
    }
    try {
      const records = await api.list();
      if (current === generation) setItems(records.map(toSaved));
    } catch (error) {
      if (current === generation) setItems([]);
      fail(error);
    }
  };

  createEffect(on(options.api, () => void reload()));

  return () => {
    const api = options.api();
    if (!api) return undefined;
    return {
      items: items(),
      onApply: (filter) => options.onApply([...filter.clauses], filter.extra),
      onSave: async (name) => {
        try {
          await api.save(name, serializeFilterPayload(options.clauses(), options.extra?.()));
          await reload();
        } catch (error) {
          fail(error);
          throw error;
        }
      },
      onDelete: (filter) => {
        void api.delete(filter.id).then(reload, fail);
      },
    };
  };
}
