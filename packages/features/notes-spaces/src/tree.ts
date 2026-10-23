export type SpaceNode = {
  id: string;
  parentId: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
};

export type SpaceTreeNode = SpaceNode & { children: SpaceTreeNode[] };

export type DeletePreview = {
  deletedSpaceIds: string[];
  movedNoteCount: number;
};

export const SPACES_EXPANDED_KEY = "pwnotes.spaces.expanded";

export function buildSpaceTree(spaces: readonly SpaceNode[]): SpaceTreeNode[] {
  const nodes = new Map<string, SpaceTreeNode>();
  for (const space of spaces) nodes.set(space.id, { ...space, children: [] });
  const roots: SpaceTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parentId);
    if (parent && parent.id !== node.id && !isDescendant(nodes, parent.id, node.id)) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: SpaceTreeNode[]) => {
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function isDescendant(nodes: Map<string, SpaceTreeNode>, startId: string, targetId: string): boolean {
  const pending = [startId];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (node) pending.push(...node.children.map((child) => child.id));
  }
  return false;
}

export function canMoveSpace(spaces: readonly SpaceNode[], spaceId: string, parentId: string): boolean {
  if (parentId === "") return true;
  if (spaceId === parentId) return false;
  const byId = new Map(spaces.map((space) => [space.id, space]));
  let parent = byId.get(parentId);
  const seen = new Set<string>();
  while (parent) {
    if (parent.id === spaceId || seen.has(parent.id)) return false;
    seen.add(parent.id);
    parent = byId.get(parent.parentId);
  }
  return true;
}

export function cascadeDeleteIds(spaces: readonly SpaceNode[], spaceId: string): string[] {
  const seen = new Set<string>([spaceId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const space of spaces) {
      if (space.parentId && seen.has(space.parentId) && !seen.has(space.id)) {
        seen.add(space.id);
        changed = true;
      }
    }
  }
  return [...seen].sort();
}

export function deletePreviewCopy(preview: DeletePreview): string {
  const childCount = Math.max(0, preview.deletedSpaceIds.length - 1);
  return `Deletes ${childCount} child Spaces; ${preview.movedNoteCount} notes move to Inbox.`;
}

export function spaceAncestors(spaces: readonly SpaceNode[], spaceId: string): SpaceNode[] {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const chain: SpaceNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(spaceId);
  current = current ? byId.get(current.parentId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = byId.get(current.parentId);
  }
  return chain;
}

export function siblingOrder(spaces: readonly SpaceNode[], parentId: string, spaceId: string, direction: -1 | 1): string[] | undefined {
  const siblings = spaces
    .filter((space) => space.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const from = siblings.findIndex((space) => space.id === spaceId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= siblings.length) return undefined;
  const ordered = siblings.map((space) => space.id);
  const moving = ordered[from]!;
  ordered[from] = ordered[to]!;
  ordered[to] = moving;
  return ordered;
}

export function previousSiblingId(spaces: readonly SpaceNode[], spaceId: string): string | undefined {
  const current = spaces.find((space) => space.id === spaceId);
  if (!current) return undefined;
  const siblings = spaces
    .filter((space) => space.parentId === current.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const index = siblings.findIndex((space) => space.id === spaceId);
  return index > 0 ? siblings[index - 1]?.id : undefined;
}

export function readExpandedSpaceIds(storage: Pick<Storage, "getItem">): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(SPACES_EXPANDED_KEY) ?? "[]");
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : [];
  } catch {
    return [];
  }
}

export function writeExpandedSpaceIds(storage: Pick<Storage, "setItem">, ids: readonly string[]): void {
  try {
    storage.setItem(SPACES_EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    /* Session-only when storage is unavailable. */
  }
}

/** @deprecated Use readExpandedSpaceIds. Kept for callers that stored collapse ids. */
export function readCollapsedSpaceIds(storage: Pick<Storage, "getItem">): string[] {
  return readExpandedSpaceIds(storage);
}

export function moveTargetOptions(spaces: readonly SpaceNode[], spaceId: string): { value: string; label: string; disabled: boolean }[] {
  return [
    { value: "", label: "Root", disabled: false },
    ...spaces.map((space) => ({
      value: space.id,
      label: space.name,
      disabled: !canMoveSpace(spaces, spaceId, space.id),
    })),
  ];
}

export function nextSortOrder(spaces: readonly SpaceNode[], parentId: string): number {
  return spaces.filter((space) => space.parentId === parentId).reduce((max, space) => Math.max(max, space.sortOrder), -1) + 1;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}
