import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import { lazy } from "solid-js";

const CalendarPage = lazy(() => import("./calendar-page").then(module => ({ default: module.CalendarPage })));

const feature: NotesFeature = {
  id: "calendar",
  routes: [{ path: "/calendar", title: "Calendar", component: CalendarPage }],
  sidebar: [{ id: "calendar", label: "Calendar", path: "/calendar", icon: "CalendarClock" }],
  commands: [{
    id: "calendar.open",
    label: "Go to Calendar",
    keywords: ["calendar", "day", "week", "month", "year", "schedule"],
    run: async () => {
      const wire = Reflect.get(globalThis, "pwnotes") as { app?: { openDeepLink?: (url: string) => Promise<void> } } | undefined;
      await wire?.app?.openDeepLink?.("pwnotes://calendar");
    },
  }],
};

export default feature;
export { CalendarPage };
export { createCalendarBridge, browserBridge } from "./bridge";
export { createCalendarStore, calendarStore } from "./store";
export { toOneShotSchedule, moveSeriesAnchor } from "./mapping";
export { visibleRange, dayHours, weekDates, monthDates } from "./grid";
