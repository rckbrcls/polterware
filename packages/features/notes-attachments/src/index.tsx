import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import { AttachmentsSection } from "./section";
import { noteAttachments } from "./embed";
import "./embed.css";

const feature: NotesFeature = {
  id: "attachments",
  routes: [],
  noteAttachments,
};

export default feature;
export { AttachmentsSection };
export { createAttachmentsBridge, browserBridge } from "./bridge";
export { createAttachmentsStore, attachmentsStore } from "./store";
export { previewUrl, recordingFileName, revisionString } from "./model";
