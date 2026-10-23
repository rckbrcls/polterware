import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import { openSearchPage } from "./bridge";
import { createSearchCommandSource } from "./command-source";
import { SearchPage } from "./search-page";

const feature: NotesFeature = {
  id: "search",
  routes: [{ path: "/search", title: "Search", component: SearchPage }],
  commandSources: [createSearchCommandSource()],
  commands: [{
    id: "search.open",
    label: "Search notes",
    keywords: ["find", "fts", "query", "search"],
    run: () => { void openSearchPage(); },
  }],
};

export default feature;
export { SearchPage };
export { createSearchStore, searchStore } from "./store";
export { createSearchBridge, browserBridge, openSearchPage } from "./bridge";
export { parseSnippet, windowHits, buildSearchRequest, RESULT_WINDOW } from "./model";
export { HighlightedSnippet } from "./snippet";
