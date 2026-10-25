import { genericBehavior, type CanvasBehavior } from "./shared";

// Persist a semantic tag, never a user-supplied CSS color.
export const colorTags = ["neutral", "yellow", "blue", "green", "red"] as const;
export function colorToken(value: unknown): string {
  const tokens: Record<string, string> = { yellow: "var(--color-warning)", blue: "var(--color-info)", green: "var(--color-brand)", red: "var(--color-danger)" };
  return Object.hasOwn(tokens, String(value)) ? tokens[String(value)]! : "var(--color-text-muted)";
}
export const brainstorm: CanvasBehavior = {
  ...genericBehavior,
  variant: (kind) => kind === "idea" || kind === "note" ? "sticky" : kind === "group" ? "frame" : genericBehavior.variant(kind),
  fields: (kind) => kind === "idea" || kind === "note" ? [{ key: "color", label: "Color tag", kind: "color" }] : [],
  defaults: (kind) => kind === "idea" || kind === "note" ? { color: "yellow" } : {},
  initialGeometry: (kind) => kind === "group" ? { width: 440, height: 300, zIndex: -1 } : {},
  edgeStyle: (kind) => ({ arrow: kind === "contains", dashed: kind === "contains" }),
};
