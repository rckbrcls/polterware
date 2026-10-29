import type { StatusTone } from "@polterware/frontend-design-system";

/** How a Fact is known, in the order the filter lists them. */
export const FACT_KINDS = [
  { id: "declared", label: "Declared", tone: "syncing" },
  { id: "observed", label: "Observed", tone: "ok" },
  { id: "inferred", label: "Inferred", tone: "warn" },
  { id: "verified", label: "Verified", tone: "ok" },
] as const satisfies readonly { id: string; label: string; tone: StatusTone }[];

export function factKindLabel(kind: string): string {
  return FACT_KINDS.find((entry) => entry.id === kind)?.label ?? (kind || "—");
}

export function factKindTone(kind: string): StatusTone {
  return FACT_KINDS.find((entry) => entry.id === kind)?.tone ?? "muted";
}
