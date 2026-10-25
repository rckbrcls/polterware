export type StructureKind = "system" | "domain" | "component";
export type StructureNode = {
  id: string;
  parentId: string;
  level: StructureKind;
  path: string;
  title: string;
  intent: string;
  repo: string;
  owner?: string;
  decisions: string[];
  uses?: string[];
  deploys?: { id: string; environmentId: string; environment: string; provider: string; resource: string }[];
};
export type StructureTreeItem = { node: StructureNode; children: StructureTreeItem[] };

/** Preserve input order and orphan records. A malformed cycle is shown once, never recursed forever. */
export function buildStructureTree(nodes: readonly StructureNode[], query = ""): StructureTreeItem[] {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, StructureNode[]>();
  for (const node of nodes) {
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : "";
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const seen = new Set<string>();
  const build = (node: StructureNode): StructureTreeItem[] => {
    if (seen.has(node.id)) return [];
    seen.add(node.id);
    return [{ node, children: (children.get(node.id) ?? []).flatMap(build) }];
  };
  const roots = (children.get("") ?? []).flatMap(build);
  for (const node of nodes) roots.push(...build(node));
  const term = query.trim().toLowerCase();
  if (!term) return roots;
  const filter = (items: StructureTreeItem[]): StructureTreeItem[] => items.flatMap((item) => {
    const descendants = filter(item.children);
    return `${item.node.title} ${item.node.level} ${item.node.path}`.toLowerCase().includes(term)
      ? [item]
      : descendants.length ? [{ ...item, children: descendants }] : [];
  });
  return filter(roots);
}

export function flattenStructureTree(items: readonly StructureTreeItem[]): StructureNode[] {
  return items.flatMap((item) => [item.node, ...flattenStructureTree(item.children)]);
}

/** Only the existing hierarchy levels are valid move destinations. */
export function structureParents(nodes: readonly StructureNode[], kind: StructureKind, movingId?: string): StructureNode[] {
  return nodes.filter((node) => node.id !== movingId &&
    (kind === "domain" ? node.level === "system" : kind === "component" ? node.level === "system" || node.level === "domain" : false));
}

/** Scope nodes form a union of subtrees; their ancestors retain the project hierarchy. */
export function filterStructureNodes<T extends Pick<StructureNode, "id" | "parentId">>(nodes: readonly T[], scopeIds: readonly string[]): T[] {
  if (scopeIds.length === 0) return [...nodes];
  const selected = new Set(scopeIds);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const included = new Set<string>();
  for (const node of nodes) {
    const chain = new Set<string>();
    let current: T | undefined = node;
    while (current && !chain.has(current.id)) {
      chain.add(current.id);
      if (selected.has(current.id)) { included.add(node.id); break; }
      current = byId.get(current.parentId);
    }
  }
  for (const id of scopeIds) {
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id); included.add(current.id); current = byId.get(current.parentId);
    }
  }
  return nodes.filter((node) => included.has(node.id));
}
