import type { WorkspaceInboxAction, WorkspaceInboxItem } from "./workspace-mocks";

/** Actions that need no answer or follow-up, so a selection can take them at once. */
const BULK_ACTIONS: readonly WorkspaceInboxAction[] = ["defer", "ignore", "verify", "reject"];

/** The bulk actions every selected item offers. */
export function sharedInboxActions(items: readonly Pick<WorkspaceInboxItem, "actions">[]): WorkspaceInboxAction[] {
  if (items.length === 0) return [];
  return BULK_ACTIONS.filter((action) => items.every((item) => item.actions.includes(action)));
}

/**
 * The items a key action (H defers, D dismisses) acts on: the selection when every selected
 * item offers it, else the active item when it does; nothing otherwise.
 */
export function keyActionTargets<T extends Pick<WorkspaceInboxItem, "actions">>(
  selection: readonly T[],
  active: T | undefined,
  action: WorkspaceInboxAction,
): T[] {
  if (selection.length > 0) return selection.every((item) => item.actions.includes(action)) ? [...selection] : [];
  return active?.actions.includes(action) ? [active] : [];
}
