import type { DocEntry, DocGroup } from "../../../packages/frontend/design-system/src/docs/types";

const modules = import.meta.glob<{ default: DocEntry }>("../../../packages/frontend/design-system/src/**/*.docs.tsx", { eager: true });
const raws = import.meta.glob<string>("../../../packages/frontend/design-system/src/**/*.docs.tsx", { eager: true, query: "?raw", import: "default" });

export interface PropRow {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

export interface PropsDoc {
  /** Large inherited attribute sets, listed by name instead of expanded. */
  extends?: string[];
  props: PropRow[];
}

const generated = import.meta.glob<Record<string, PropsDoc>>("./generated/props.json", { eager: true, import: "default" });
const propsByExport: Record<string, PropsDoc> = Object.values(generated)[0] ?? {};

export const GROUP_ORDER: DocGroup[] = ["Buttons", "Inputs", "Menus", "Overlays", "Feedback", "Data", "Layout", "Pages", "Icons"];

export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Returns the JSX between `#region <id>` and `#endregion`, dedented, without a wrapping fragment. */
export function exampleSource(raw: string, id: string): string {
  const lines = raw.split("\n");
  const start = lines.findIndex(line => line.includes(`#region ${id}`));
  if (start < 0) return "// Source unavailable.";
  const end = lines.findIndex((line, index) => index > start && line.includes("#endregion"));
  let body = lines.slice(start + 1, end < 0 ? undefined : end);
  if (body[0]?.trim() === "<>" && body[body.length - 1]?.trim() === "</>") body = body.slice(1, -1);
  const indent = Math.min(...body.filter(line => line.trim()).map(line => line.length - line.trimStart().length));
  return body.map(line => line.slice(Number.isFinite(indent) ? indent : 0)).join("\n").trim();
}

export interface DocPage {
  entry: DocEntry;
  slug: string;
  sources: Record<string, string>;
  props: Array<{ exportName: string; doc: PropsDoc }>;
}

export const pages: DocPage[] = Object.entries(modules)
  .map(([path, module]) => {
    const entry = module.default;
    const raw = raws[path] ?? "";
    return {
      entry,
      slug: slugOf(entry.name),
      sources: Object.fromEntries(entry.examples.map(example => [example.id, exampleSource(raw, example.id)])),
      // A namespace export (DataTable) also pulls in its members (DataTable.Root).
      props: entry.exports.flatMap(exportName => Object.entries(propsByExport)
        .filter(([key]) => key === exportName || key.startsWith(`${exportName}.`))
        .map(([key, doc]) => ({ exportName: key, doc }))),
    };
  })
  .sort((a, b) => GROUP_ORDER.indexOf(a.entry.group) - GROUP_ORDER.indexOf(b.entry.group) || a.entry.name.localeCompare(b.entry.name));

export const documentedExports = new Set(pages.flatMap(page => page.entry.exports));
