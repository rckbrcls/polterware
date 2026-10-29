import type { WorkspaceInboxAction, WorkspaceInboxItem } from "./workspace-mocks";

/** Actions that need no answer or follow-up, so a selection can take them at once. */
const BULK_ACTIONS: readonly WorkspaceInboxAction[] = ["defer", "ignore", "verify", "reject"];

/** The bulk actions every selected item offers. */
export function sharedInboxActions(items: readonly Pick<WorkspaceInboxItem, "actions">[]): WorkspaceInboxAction[] {
  if (items.length === 0) return [];
  return BULK_ACTIONS.filter((action) => items.every((item) => item.actions.includes(action)));
}
