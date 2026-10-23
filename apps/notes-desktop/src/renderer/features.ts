import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import attachments from "@polterware/feature-notes-attachments";
import calendar from "@polterware/feature-notes-calendar";
import focus from "@polterware/feature-notes-focus";
import map from "@polterware/feature-notes-map";
import notes from "@polterware/feature-notes-library";
import spaces from "@polterware/feature-notes-spaces";
import schedule from "@polterware/feature-notes-schedule";
import search from "@polterware/feature-notes-search";
import settings from "@polterware/feature-notes-settings";
import shell from "@polterware/feature-notes-shell";

export const features: NotesFeature[] = [
  shell,
  notes,
  spaces,
  schedule,
  calendar,
  attachments,
  focus,
  map,
  settings,
  search,
];
