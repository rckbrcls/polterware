import type { WorkspaceStructureNode } from "@polterware/feature-shell";

/** In-memory Structure mutations for the explicitly seeded browser bridge. */
export function createBrowserStructure(seedProjectId: string, seed: readonly Partial<WorkspaceStructureNode>[]) {
  const projects = new Map<string, WorkspaceStructureNode[]>();
  const list = (projectId: string) => {
    if (!projects.has(projectId)) projects.set(projectId, projectId === seedProjectId ? seed.map((node) => ({
      id: "", parentId: "", level: "domain", slug: "", path: "", title: "", intent: "", decisions: [], invariants: [], status: "proposed",
      childCount: 0, featureCount: 0, openQuestions: 0, repo: "", folder: "", migrationFrom: "", migrationTo: "", deploys: [], ...structuredClone(node),
    })) : []);
    return projects.get(projectId)!;
  };
  return {
    list: (projectId: string) => ({ nodes: structuredClone(list(projectId)), historical: false }),
    apply: (projectId: string, text: string, dryRun = false) => {
      const heading = /^# ([^:\s]+):\s*(.+)$/m.exec(text);
      if (!heading) throw new Error("A structure node heading is required.");
      const metadata = (key: string) => new RegExp(`(?:^|·\\s*)${key}:([^\\n·]*)`, "m").exec(text)?.[1]?.trim();
      const level = metadata("level");
      if (level !== "domain" && level !== "component") throw new Error("Invalid structure kind.");
      const nodes = list(projectId);
      const existing = nodes.find((node) => node.path === heading[1]);
      const under = metadata("under");
      const parent = under === undefined && existing ? nodes.find((node) => node.id === existing.parentId) : under ? nodes.find((node) => node.path === under) : undefined;
      if (under && !parent) throw new Error("Parent not found.");
      // A domain sits under the project; a component under a domain or loose under the project.
      if (level === "domain" && parent || level === "component" && parent && parent.level !== "domain") throw new Error("Invalid parent kind.");
      // Like the core, a node may change its level where it sits; a component cannot hold children.
      if (existing && level === "component" && nodes.some((node) => node.parentId === existing.id)) throw new Error("A node with children cannot become a component.");
      const slug = existing?.slug ?? heading[1]!.split("/").at(-1)!;
      const nextPath = parent ? `${parent.path}/${slug}` : slug;
      if (nodes.some((node) => node !== existing && node.path === nextPath)) throw new Error("That structure path already exists.");
      const deploysText = metadata("deploys");
      const deploys = deploysText === undefined ? undefined : deploysText.split(",").map((part) => {
        const [env, rest] = part.trim().split("=");
        const [provider, resource] = rest?.split(":") ?? [];
        return { id: `deploy-${crypto.randomUUID()}`, environmentId: env?.trim() ?? "", environment: env?.trim() ?? "", provider: provider?.trim() ?? "", resource: resource?.trim() ?? "" };
      }).filter((d) => d.environmentId && d.provider && d.resource);
      const kind = metadata("kind");
      if (kind && level !== "component") throw new Error("Only components have a kind.");
      const tech = metadata("tech");
      const repo = metadata("repo");
      const folder = metadata("path");
      // The intent is the paragraph after the meta lines.
      const intent = text.slice(text.indexOf(heading[0]) + heading[0].length).split(/\n\s*\n/).slice(1).join("\n\n").trim() || undefined;
      if (dryRun) return { applied: false, diagnostics: [], ops: [`${existing ? "~" : "+"} node ${nextPath}`] };
      if (existing) {
        const oldPath = existing.path;
        existing.title = heading[2]!.trim();
        existing.level = level;
        if (deploys !== undefined) existing.deploys = deploys;
        if (kind !== undefined) existing.kind = kind;
        if (tech !== undefined) existing.tech = tech;
        if (repo !== undefined) existing.repo = repo;
        if (folder !== undefined) existing.folder = folder;
        if (intent !== undefined) existing.intent = intent;
        if (under !== undefined) {
          existing.parentId = parent?.id ?? "";
          const rewrite = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`) ? nextPath + path.slice(oldPath.length) : path;
          for (const node of nodes) node.path = rewrite(node.path);
        }
      } else {
        nodes.push({ id: `structure-${crypto.randomUUID()}`, parentId: parent?.id ?? "", level, slug, path: nextPath, title: heading[2]!.trim(), intent: intent ?? "", decisions: [], invariants: [], status: "proposed", childCount: 0, featureCount: 0, openQuestions: 0, repo: "", folder: "", kind: kind ?? "", tech: tech ?? "", migrationFrom: "", migrationTo: "", deploys: [] });
      }
      for (const node of nodes) node.childCount = nodes.filter((child) => child.parentId === node.id).length;
      return { applied: true, diagnostics: [], ops: [`${existing ? "~" : "+"} node ${nextPath}`] };
    },
  };
}
