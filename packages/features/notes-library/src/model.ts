// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- MessageShape is the protobuf library export.
import type { DescMessage, MessageShape as ContractMessage } from "@bufbuild/protobuf";
import type { NoteSchema, NoteSummarySchema, SpaceSchema, TagSchema, ActivityEventSchema, OccurrenceSchema, UpdateNoteRequestSchema, CheckItemInputSchema, CreateNoteRequestSchema, NoteService, SpaceService, TagService, ActivityService, ScheduleService } from "@polterware/notes-contracts";
import type { DescMethodUnary } from "@bufbuild/protobuf";

/** Protobuf JSON: int64 is a decimal string, timestamps are RFC 3339. */
export type Wire<T> = T extends { $typeName: "google.protobuf.Timestamp" } ? string
  : T extends bigint ? string
  : T extends readonly (infer V)[] ? Wire<V>[]
  : T extends object ? { [K in keyof T as K extends "$typeName" ? never : K]?: Wire<T[K]> }
  : T;
export type JsonOf<S extends DescMessage> = Wire<ContractMessage<S>>;
type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: Wire<ContractMessage<S["method"][K]["input"]>>) => Promise<Wire<ContractMessage<S["method"][K]["output"]>>> : never;
};
export type NotesBridge = {
  notes: Namespace<typeof NoteService>;
  spaces: Namespace<typeof SpaceService>;
  tags: Namespace<typeof TagService>;
  activity: Namespace<typeof ActivityService>;
  schedule: Namespace<typeof ScheduleService>;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: { openDeepLink(url: string): Promise<void>; onDeepLink?(callback: (link: { url: string; route: string }) => void): () => void; getDeepLink?(): Promise<{ url: string; route: string } | null> };
};
export type NoteJSON = JsonOf<typeof NoteSchema>;
export type SummaryJSON = JsonOf<typeof NoteSummarySchema>;
export type Patch = Omit<JsonOf<typeof UpdateNoteRequestSchema>, "id" | "expectedRev">;
export type ChecklistInput = JsonOf<typeof CheckItemInputSchema>;
export type OccurrenceJSON = JsonOf<typeof OccurrenceSchema>;
export type CreateNoteJSON = JsonOf<typeof CreateNoteRequestSchema>;
export type SpaceJSON = JsonOf<typeof SpaceSchema>;
export type TagJSON = JsonOf<typeof TagSchema>;
export type ActivityJSON = JsonOf<typeof ActivityEventSchema>;

export function revisionString(rev: string | number | bigint | undefined): string {
  if (typeof rev === "string" && rev !== "") return rev;
  if (typeof rev === "bigint") return rev.toString();
  if (typeof rev === "number" && Number.isFinite(rev)) return Math.trunc(rev).toString();
  return "0";
}

export type NoteRow = {
  id: string; title: string; content: string; status: string; spaceId: string; pinned: boolean;
  priority?: number; dueAt?: string; dueAllDay: boolean; rev: string; tagIds: string[];
  createdAt?: string; updatedAt?: string; sortOrder: number; scheduleLabel: string;
};
export type NoteRecord = NoteRow & {
  checklist: NonNullable<NoteJSON["checklist"]>; tags: NonNullable<NoteJSON["tags"]>;
  autoCompleteOnChecklist: boolean; schedule?: NoteJSON["schedule"]; place?: NoteJSON["place"];
  attachments: NonNullable<NoteJSON["attachments"]>; completions: NonNullable<NoteJSON["completions"]>;
};
export function rowFromJSON(row: SummaryJSON | NoteJSON): NoteRow {
  const summary = row as SummaryJSON;
  const note = row as NoteJSON;
  return {
    id: row.id ?? "", title: row.title ?? "", content: summary.snippet ?? note.content ?? "", status: row.status ?? "active",
    spaceId: row.spaceId ?? "", pinned: row.pinned ?? false, priority: row.priority, dueAt: row.dueAt,
    dueAllDay: row.dueAllDay ?? false, rev: revisionString(row.rev), tagIds: summary.tagIds ?? (note.tags ?? []).map(tag => tag.id ?? ""),
    createdAt: row.createdAt, updatedAt: row.updatedAt, sortOrder: row.sortOrder ?? 0, scheduleLabel: summary.scheduleLabel ?? "",
  };
}
export function recordFromJSON(row: NoteJSON): NoteRecord {
  return { ...rowFromJSON(row), content: row.content ?? "", checklist: row.checklist ?? [], tags: row.tags ?? [],
    tagIds: (row.tags ?? []).map(tag => tag.id ?? ""), autoCompleteOnChecklist: row.autoCompleteOnChecklist ?? false,
    schedule: row.schedule, place: row.place, attachments: row.attachments ?? [], completions: row.completions ?? [] };
}
export function mergePatch(previous: Patch, incoming: Patch): Patch {
  const merged = { ...previous, ...incoming };
  for (const [field, clear] of [["spaceId", "clearSpaceId"], ["priority", "clearPriority"], ["dueAt", "clearDueAt"]] as const) {
    if (incoming[clear] === true) delete merged[field];
    else if (incoming[field] !== undefined) merged[clear] = false;
  }
  return merged;
}
export function applyPatch<T extends NoteRow>(row: T, patch: Patch): T {
  return { ...row, ...patch, spaceId: patch.clearSpaceId ? "" : patch.spaceId ?? row.spaceId,
    priority: patch.clearPriority ? undefined : patch.priority ?? row.priority,
    dueAt: patch.clearDueAt ? undefined : patch.dueAt ?? row.dueAt };
}
export type ListFilter = { query: string; status: string; pinned: boolean; tagId: string; order: string; spaceId?: string; inbox?: boolean };
export const DEFAULT_FILTER: ListFilter = { query: "", status: "active", pinned: false, tagId: "", order: "due" };
export function filterRows(rows: readonly NoteRow[], filter: ListFilter): NoteRow[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const result = rows.filter(row => (!filter.status || row.status === filter.status) && (!filter.inbox || !row.spaceId)
    && (filter.spaceId === undefined || row.spaceId === filter.spaceId) && (!filter.pinned || row.pinned)
    && (!filter.tagId || row.tagIds.includes(filter.tagId))
    && (!query || row.title.toLocaleLowerCase().includes(query) || row.content.toLocaleLowerCase().includes(query)));
  const compare = filter.order === "title" ? (a: NoteRow, b: NoteRow) => a.title.localeCompare(b.title)
    : filter.order === "updated" ? (a: NoteRow, b: NoteRow) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
    : (a: NoteRow, b: NoteRow) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.sortOrder - b.sortOrder;
  return result.sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare(a, b));
}
export function todayGroup(row: Pick<NoteRow, "dueAt" | "dueAllDay">, now: Date): "Overdue" | "Today" | "Upcoming 7 days" | undefined {
  if (!row.dueAt) return undefined;
  const due = new Date(row.dueAt);
  const date = row.dueAllDay ? row.dueAt.slice(0, 10) : localDate(due);
  const today = localDate(now);
  const end = new Date(now); end.setDate(end.getDate() + 7);
  if (date < today) return "Overdue";
  if (date === today) return "Today";
  if (date <= localDate(end)) return "Upcoming 7 days";
  return undefined;
}
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function checklistInputs(items: NoteRecord["checklist"]): ChecklistInput[] {
  return items.map((item, index) => ({ id: item.id, title: item.title ?? "", detail: item.detail ?? "", done: item.done ?? false, sortOrder: index }));
}
export function reorderChecklist(items: ChecklistInput[], index: number, direction: -1 | 1): ChecklistInput[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items]; [next[index], next[target]] = [next[target]!, next[index]!];
  return next.map((item, sortOrder) => ({ ...item, sortOrder }));
}
const TASK_LINE = /^\\?[-*+] \\?\[( |x|X)\\?\] ?(.*)$/;
/** One markdown document: the note text followed by the checklist as `- [ ]` task lines. */
export function joinChecklist(content: string, items: readonly Pick<ChecklistInput, "title" | "done">[]): string {
  const tasks = items.map(item => `- [${item.done ? "x" : " "}] ${item.title ?? ""}`).join("\n");
  const text = content.trim();
  return text && tasks ? `${text}\n\n${tasks}` : text || tasks;
}
/** Inverse of `joinChecklist`; existing ids and details are carried over by title, then by position. */
export function splitChecklist(body: string, previous: readonly ChecklistInput[] = []): { content: string; items: ChecklistInput[] } {
  const text: string[] = [];
  const parsed: { title: string; done: boolean }[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const task = fenced ? null : TASK_LINE.exec(line);
    if (task) parsed.push({ title: task[2]!.trim(), done: task[1] !== " " });
    else text.push(line);
  }
  const used = new Set<number>();
  const matched = parsed.map(item => {
    const index = previous.findIndex((candidate, i) => !used.has(i) && (candidate.title ?? "") === item.title);
    if (index >= 0) used.add(index);
    return index;
  });
  const leftovers = previous.map((_, i) => i).filter(i => !used.has(i));
  const items = parsed.map((item, sortOrder) => {
    const index = matched[sortOrder]! >= 0 ? matched[sortOrder]! : leftovers.shift() ?? -1;
    const source = index >= 0 ? previous[index] : undefined;
    return { id: source?.id, title: item.title, detail: source?.detail ?? "", done: item.done, sortOrder };
  });
  return { content: text.join("\n").replace(/\n{3,}/g, "\n\n").trim(), items };
}
export function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function isConflict(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return code === 9 || code === 10 || code === "aborted" || code === "conflict" || code === "failed_precondition"
    || /\b(conflict|aborted|revision)\b/i.test(errorText(error));
}
export type NoteFailure = { message: string; conflict: boolean };
export function parseNoteFailure(error: unknown): NoteFailure { return { message: errorText(error), conflict: isConflict(error) }; }
