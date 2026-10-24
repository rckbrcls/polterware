/**
 * How an entity kind may be shown:
 * - `peek`: lateral panel only, never a full page.
 * - `page`: full page only, never the lateral panel.
 * - `both`: lateral panel that can expand into a full page.
 */
export type DetailDisplay = "peek" | "page" | "both";

export const DETAIL_DISPLAY: Readonly<Record<string, DetailDisplay>> = {
  fact: "peek",
  "inbox-item": "peek",
  change: "peek",
  "dispatch-quota": "peek",
  evidence: "page",
  "arch-view": "page",
  verdict: "page",
  card: "page",
  "arch-node": "both",
  "atlas-node": "both",
  "atlas-card": "both",
};

/** Unknown kinds keep the previous behavior: panel plus expansion. */
export function detailDisplayFor(entityKind: string | null | undefined): DetailDisplay {
  return (entityKind && DETAIL_DISPLAY[entityKind]) || "both";
}

/** Full writing canvases use the global panel only for their properties. */
export function isDocumentDetail(entityKind: string | null | undefined): boolean {
  return entityKind === "verdict" || entityKind === "evidence" || entityKind === "card";
}

export function canExpandDetail(entityKind: string | null | undefined): boolean {
  return detailDisplayFor(entityKind) !== "peek";
}
