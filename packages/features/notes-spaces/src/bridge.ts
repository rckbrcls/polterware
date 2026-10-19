import { createShellBridge, type ShellBridge, type ShellWireBridge } from "@polterware/feature-notes-shell";
import type { Space } from "@polterware/notes-contracts";
import { cascadeDeleteIds, type DeletePreview, type SpaceNode } from "./tree";

export function readNotesWire(): ShellWireBridge {
  const pwnotes = typeof window === "undefined" ? undefined : (window as unknown as { pwnotes?: ShellWireBridge }).pwnotes;
  if (!pwnotes) throw new Error("Polterware Notes bridge unavailable");
  return pwnotes;
}

export function spacesBridge(wire?: ShellWireBridge): ShellBridge {
  return createShellBridge(wire ?? readNotesWire());
}

/** int64 travels on the wire as a decimal string. */
export function wireRev(rev: bigint | string | number | undefined): string {
  return rev === undefined ? "0" : String(rev);
}

export function toSpaceNode(space: Space): SpaceNode {
  return {
    id: space.id,
    parentId: space.parentId,
    name: space.name,
    color: space.color,
    icon: space.icon,
    sortOrder: space.sortOrder,
  };
}

export async function loadSpaces(bridge: ShellBridge): Promise<Space[]> {
  const response = await bridge.spaces.list({});
  return response.spaces;
}

export async function loadNoteCounts(bridge: ShellBridge, ids: readonly string[]): Promise<Record<string, number>> {
  const pairs = await Promise.all(
    ids.map(async (spaceId) => {
      const listed = await bridge.notes.list({ spaceId, includeDescendants: false, limit: 1 });
      return [spaceId, listed.total] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

export type SpaceNoteLink = { id: string; title: string };

export async function loadSpaceNotes(bridge: ShellBridge, ids: readonly string[]): Promise<Record<string, SpaceNoteLink[]>> {
  const pairs = await Promise.all(
    ids.map(async (spaceId) => {
      const listed = await bridge.notes.list({ spaceId, includeDescendants: false, limit: 100, order: "updated" });
      return [spaceId, (listed.notes ?? []).map((note) => ({ id: note.id ?? "", title: note.title || "Untitled" })).filter((note) => note.id)] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

export async function loadDeletePreview(bridge: ShellBridge, spaces: readonly SpaceNode[], spaceId: string): Promise<DeletePreview> {
  const deletedSpaceIds = cascadeDeleteIds(spaces, spaceId);
  const listed = await bridge.notes.list({ spaceId, includeDescendants: true, limit: 1 });
  return { deletedSpaceIds, movedNoteCount: listed.total };
}

export function parentPatch(parentId: string): { parentId: string } | { clearParent: true } {
  return parentId ? { parentId } : { clearParent: true };
}

export function hexFromPicker(details: unknown): string {
  const candidate =
    details && typeof details === "object" && "value" in details
      ? (details as { value: { toString: (format?: string) => string } }).value
      : details;
  if (typeof candidate === "string") return isLikelyHex(candidate) ? candidate.slice(0, 7).toUpperCase() : "#7EA8F0";
  if (candidate && typeof candidate === "object" && "toString" in candidate) {
    const raw = (candidate as { toString: (format?: string) => string }).toString("hex");
    const hex = raw.startsWith("#") ? raw : `#${raw}`;
    return isLikelyHex(hex) ? hex.slice(0, 7).toUpperCase() : "#7EA8F0";
  }
  return "#7EA8F0";
}

function isLikelyHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}/.test(value);
}

/** Drag payload shared by note cards (notes-library) and Space drop targets. */
export const ITEM_DRAG_TYPE = "application/x-notes-item";
export function draggedNoteId(transfer: DataTransfer | null | undefined): string | undefined {
  try {
    const parsed = JSON.parse(transfer?.getData(ITEM_DRAG_TYPE) || "null") as { kind?: string; id?: string } | null;
    return parsed?.kind === "note" && parsed.id ? parsed.id : undefined;
  } catch { return undefined; }
}
export function hasDraggedNote(transfer: DataTransfer | null | undefined): boolean {
  return Array.from(transfer?.types ?? []).includes(ITEM_DRAG_TYPE);
}
/** Move a note into a Space (empty id = Inbox), like moving a file into a folder. */
export async function moveNoteToSpace(noteId: string, spaceId: string) {
  const bridge = spacesBridge();
  const { note } = await bridge.notes.get({ id: noteId });
  if (!note || (note.spaceId ?? "") === spaceId) return;
  await bridge.notes.update({ id: noteId, expectedRev: String(note.rev ?? 0), ...(spaceId ? { spaceId } : { clearSpaceId: true }) });
}
