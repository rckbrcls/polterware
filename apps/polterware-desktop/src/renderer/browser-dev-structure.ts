import type { WorkspaceStructureNode } from "@polterware/feature-shell";

/** In-memory Structure mutations for the explicitly seeded browser bridge. */
export function createBrowserStructure(seedProjectId: string, seed: readonly Partial<WorkspaceStructureNode>[]) {
  const projects = new Map<string, WorkspaceStructureNode[]>();
  const list = (projectId: string) => {
    if (!projects.has(projectId)) projects.set(projectId, projectId === seedProjectId ? seed.map((node) => ({
      id: "", parentId: "", level: "system", slug: "", path: "", title: "", intent: "", decisions: [], invariants: [], status: "proposed",
      childCount: 0, featureCount: 0, openQuestions: 0, repo: "", folder: "", migrationFrom: "", migrationTo: "", uses: [], deploys: [], ...structuredClone(node),
    })) : []);
    return projects.get(projectId)!;
  };
  return {
    list: (projectId: string) => ({ nodes: structuredClone(list(projectId)), driftSlugs: projectId === seedProjectId ? ["api"] : [], historical: false }),
    apply: (projectId: string, text: string, dryRun = false) => {
      const heading = /^# ([^:\s]+):\s*(.+)$/m.exec(text);
      if (!heading) throw new Error("A structure node heading is required.");
      const metadata = (key: string) => new RegExp(`(?:^|·\\s*)${key}:([^\\n·]*)`, "m").exec(text)?.[1]?.trim();
      const level = metadata("level");
      if (level !== "system" && level !== "domain" && level !== "component") throw new Error("Invalid structure kind.");
      const nodes = list(projectId);
      const existing = nodes.find((node) => node.path === heading[1]);
      const under = metadata("under");
      const parent = under === undefined && existing ? nodes.find((node) => node.id === existing.parentId) : under ? nodes.find((node) => node.path === under) : undefined;
      if (under && !parent) throw new Error("Parent not found.");
      if (level === "system" && parent || level === "domain" && parent?.level !== "system" || level === "component" && parent?.level !== "system" && parent?.level !== "domain") throw new Error("Invalid parent kind.");
      if (existing && existing.level !== level) throw new Error("A move cannot change kind.");
      const slug = existing?.slug ?? heading[1]!.split("/").at(-1)!;
      const nextPath = parent ? `${parent.path}/${slug}` : slug;
      if (nodes.some((node) => node !== existing && node.path === nextPath)) throw new Error("That structure path already exists.");
      const usesText = metadata("uses");
      const uses = usesText === undefined ? undefined : usesText.split(",").map((path) => path.trim()).filter(Boolean);
      if (uses?.some((path) => path === existing?.path || !nodes.some((node) => node.path === path))) throw new Error("Unknown dependency or self dependency.");
      const deploysText = metadata("deploys");
      const deploys = deploysText === undefined ? undefined : deploysText.split(",").map((part) => {
        const [env, rest] = part.trim().split("=");
        const [provider, resource] = rest?.split(":") ?? [];
        return { id: `deploy-${crypto.randomUUID()}`, environmentId: env?.trim() ?? "", environment: env?.trim() ?? "", provider: provider?.trim() ?? "", resource: resource?.trim() ?? "" };
      }).filter((d) => d.environmentId && d.provider && d.resource);
      if (dryRun) return { applied: false, diagnostics: [], ops: [`${existing ? "~" : "+"} node ${nextPath}`] };
      if (existing) {
        const oldPath = existing.path;
        existing.title = heading[2]!.trim();
        if (uses) existing.uses = uses;
        if (deploys !== undefined) existing.deploys = deploys;
        if (under !== undefined) {
          existing.parentId = parent?.id ?? "";
          const rewrite = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`) ? nextPath + path.slice(oldPath.length) : path;
          for (const node of nodes) {
            node.path = rewrite(node.path);
            node.uses = (node.uses ?? []).map(rewrite);
          }
        }
      } else {
        nodes.push({ id: `structure-${crypto.randomUUID()}`, parentId: parent?.id ?? "", level, slug, path: nextPath, title: heading[2]!.trim(), intent: "", decisions: [], invariants: [], status: "proposed", childCount: 0, featureCount: 0, openQuestions: 0, repo: "", folder: "", migrationFrom: "", migrationTo: "", uses: uses ?? [], deploys: [] });
      }
      for (const node of nodes) node.childCount = nodes.filter((child) => child.parentId === node.id).length;
      return { applied: true, diagnostics: [], ops: [`${existing ? "~" : "+"} node ${nextPath}`] };
    },
  };
}
