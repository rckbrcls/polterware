import type { DescMethodUnary, MessageShape } from "@bufbuild/protobuf";
import type * as Contracts from "@polterware/notes-contracts";
import type { NotesDesktopBridge } from "../src/shared/bridge";

// The frozen schemas omit generated JSON types. Describe their wire encoding
// locally so test responses remain typed without changing contracts or Main.
type Wire<T> = T extends { $typeName: "google.protobuf.Timestamp" } ? string
  : T extends bigint ? string
  : T extends Uint8Array ? string
  : T extends (infer U)[] ? Wire<U>[]
  : T extends object ? { [K in keyof T as K extends "$typeName" | "$unknown" ? never : K]: Wire<T[K]> }
  : T;
type Input<T> = T extends (infer U)[] ? Input<U>[] : T extends object ? { [K in keyof T]?: Input<T[K]> } : T;
type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: Input<Wire<MessageShape<S["method"][K]["input"]>>>) => Promise<Partial<Wire<MessageShape<S["method"][K]["output"]>>>>
    : never;
};
type TestBridge = Omit<NotesDesktopBridge, "notes" | "spaces" | "tags" | "schedule" | "places" | "attachments" | "focus" | "review" | "search" | "reminders" | "activity" | "settings" | "agents" | "maintenance"> & {
  notes: Namespace<typeof Contracts.NoteService>;
  spaces: Namespace<typeof Contracts.SpaceService>;
  tags: Namespace<typeof Contracts.TagService>;
  schedule: Namespace<typeof Contracts.ScheduleService>;
  places: Namespace<typeof Contracts.PlaceService>;
  attachments: Namespace<typeof Contracts.AttachmentService>;
  focus: Namespace<typeof Contracts.FocusService>;
  review: Namespace<typeof Contracts.ReviewService>;
  search: Namespace<typeof Contracts.SearchService>;
  reminders: Namespace<typeof Contracts.ReminderService>;
  activity: Namespace<typeof Contracts.ActivityService>;
  settings: Namespace<typeof Contracts.SettingsService>;
  agents: Namespace<typeof Contracts.AgentAccessService>;
  maintenance: Namespace<typeof Contracts.MaintenanceService>;
};
declare global { interface Window { pwnotes: TestBridge } }
