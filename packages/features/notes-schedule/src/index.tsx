import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import { lazy } from "solid-js";

const ScheduleCard = lazy(() => import("./schedule-card").then(module => ({ default: module.ScheduleCard })));

const feature: NotesFeature = {
  id: "schedule",
  routes: [],
  detailSections: [{ id: "schedule", order: 10, component: ScheduleCard }],
};

export default feature;
export { ScheduleCard };
export { createScheduleBridge, browserBridge } from "./bridge";
export { toScheduleInput, formFromSchedule, reminderWording } from "./mapping";
