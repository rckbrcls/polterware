export type PromotionKind = "card" | "decision" | "fact";
export type PromotionInput = { kind: PromotionKind; title: string; slug: string; canvasName: string };
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
export function deriveSlug(label: string, existing: readonly string[] = []): string {
  const base = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72).replace(/-$/, "") || "canvas-item";
  let slug = base;
  for (let n = 2; existing.includes(slug); n++) slug = `${base}-${n}`;
  return slug;
}
export function promotionText(input: PromotionInput): string {
  const title = oneLine(input.title);
  if (!title) throw new Error("Title is required.");
  if ((input.kind === "card" || input.kind === "fact") && (input.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))) throw new Error("Use a lowercase-kebab slug.");
  // Frontmatter values are raw single lines in the Polter codec, not YAML strings.
  const rationale = input.kind === "fact" ? `promoted from canvas ${oneLine(input.canvasName)}` : `Promoted from canvas ${oneLine(input.canvasName)}.`;
  const header = `---\npolter: 1\nsummary: Promote canvas item: ${title}\nrationale: ${rationale}\n---\n\n`;
  if (input.kind === "fact") return header + `#### ${input.slug}: ${title}\nkind: declared\n`;
  return header + (input.kind === "card" ? `## ${input.slug}: ${title}\nstage: shape\n` : `### new: ${title}\nstatus: proposed\n`);
}
/** Creation succeeded but reading its identity failed: retrying must not create a duplicate. */
export class PromotionAppliedError extends Error {}
export function assertApplied(response: { applied?: unknown; diagnostics?: unknown }): void {
  const diagnostics = Array.isArray(response.diagnostics) ? response.diagnostics as { severity?: string; message?: string }[] : [];
  const errors = diagnostics.filter((item) => item.severity === "error");
  if (errors.length || response.applied !== true) throw new Error(errors.map((item) => item.message).join("\n") || "ApplyPolter did not apply the promotion.");
}
/** FormatPlan decision create lines end with the JSON-quoted assigned Decision title. */
export function createdDecisionTitle(ops: unknown): string {
  const line = Array.isArray(ops) ? ops.find((line): line is string => typeof line === "string" && line.startsWith("+ decision ")) : undefined;
  const quoted = line?.match(/("(?:[^"\\]|\\.)*")$/)?.[1];
  if (!quoted) throw new Error("ApplyPolter returned no created Decision identity.");
  return JSON.parse(quoted) as string;
}

/** Fact create plans carry the exact canon identity as their first field. */
export function createdFactId(ops: unknown): string {
  const line = Array.isArray(ops) ? ops.find((line): line is string => typeof line === "string" && line.startsWith("+ fact ")) : undefined;
  const id = line?.match(/^\+ fact (\S+) /)?.[1];
  if (!id) throw new Error("ApplyPolter returned no created Fact identity.");
  return id;
}
