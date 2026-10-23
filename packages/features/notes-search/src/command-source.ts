import type { CommandSourceDef } from "@polterware/feature-notes-shell/feature";
import { createSearchStore, type SearchStore } from "./store";

/** Dedicated store instance keeps Commander queries separate from page filters. */
export function createSearchCommandSource(store: SearchStore = createSearchStore()): CommandSourceDef {
  return {
    id: "search.notes",
    async search(query) {
      const hits = await store.commandQuery(query);
      return { hits: hits.filter(hit => hit.noteId).map(hit => ({
        id: hit.noteId!,
        label: hit.title || "Untitled note",
        snippet: hit.snippet,
        run: () => { void store.openHit(hit.noteId!); },
      })) };
    },
  };
}
