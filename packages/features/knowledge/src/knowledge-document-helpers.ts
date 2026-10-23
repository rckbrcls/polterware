import type { StatusTone } from "@polterware/frontend-design-system";

export type { StatusTone };

export function verdictStatusTone(status: string): StatusTone {
  if (status === "accepted" || status === "active") return "ok";
  if (status === "proposed" || status === "superseded") return "muted";
  return "warn";
}

export function libraryStatusTone(status: string): StatusTone {
  if (status === "published" || status === "accepted" || status === "active") return "ok";
  if (status === "proposed" || status === "superseded") return "muted";
  return "warn";
}
