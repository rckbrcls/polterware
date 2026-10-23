export function plainSnippet(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/<\/?b>/gi, "").replace(/\s+/g, " ").trim();
}
