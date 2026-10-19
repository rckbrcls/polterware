import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import { lazy } from "solid-js";
import { focusStore } from "./store";

function noteIdFromFocusLink(url: URL): string | null {
  if (url.protocol !== "pwnotes:" || url.hostname !== "note" || url.searchParams.get("action") !== "focus") return null;
  const id = url.pathname.replace(/^\//, "");
  return id || null;
}

const FocusPage = lazy(() => import("./focus-page").then(module => ({ default: module.FocusPage })));
const FocusRecipeSection = lazy(() => import("./focus-recipe-section").then(module => ({ default: module.FocusRecipeSection })));

const feature: NotesFeature = {
  id: "focus",
  routes: [{ path: "/focus", title: "Focus", component: FocusPage }],
  sidebar: [{ id: "focus", label: "Focus", path: "/focus", icon: "Clock" }],
  commands: [{
    id: "focus.start",
    label: "Start focus",
    keywords: ["pomodoro", "timer", "focus", "start"],
    run: () => { void focusStore.startCommand(); },
  }],
  detailSections: [{ id: "focus-recipe", order: 40, component: FocusRecipeSection }],
  onDeepLink(url) {
    const id = noteIdFromFocusLink(url);
    if (!id) return false;
    void focusStore.startNote(id).catch(() => {});
    return false;
  },
};

export default feature;
export { FocusPage, FocusRecipeSection };
export { createFocusStore, focusStore } from "./store";
export { createFocusBridge, browserBridge } from "./bridge";
export { createFocusTimer } from "./timer";
