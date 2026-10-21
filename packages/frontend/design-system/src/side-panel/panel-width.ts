import { isServer } from "solid-js/web";

export const DETAIL_PANEL_DEFAULT_WIDTH = 400;
export const DETAIL_PANEL_MIN_WIDTH = 320;
export const DETAIL_PANEL_MAX_WIDTH = 720;
/** Legacy identifier; frames now use an instance-specific suffix. */
export const DETAIL_PANEL_SIDEBAR_ID = "pw-detail-panel-sidebar";

export function clampDetailPanelWidth(width: number, containerWidth: number): number {
  const upper = containerWidth > 0 ? Math.min(DETAIL_PANEL_MAX_WIDTH, Math.max(1, containerWidth - 16)) : DETAIL_PANEL_MAX_WIDTH;
  return Math.min(upper, Math.max(Math.min(DETAIL_PANEL_MIN_WIDTH, upper), Number.isFinite(width) ? width : DETAIL_PANEL_DEFAULT_WIDTH));
}

/** Floating JSON is intentionally ignored; its preference remains available to FloatingWindow. */
export function readDetailPanelWidth(raw: string | null): number {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? clampDetailPanelWidth(value, 0) : DETAIL_PANEL_DEFAULT_WIDTH;
  } catch { return DETAIL_PANEL_DEFAULT_WIDTH; }
}

export function readStoredWidth(storageKey?: string, legacyStorageKey?: string): number {
  if (isServer) return DETAIL_PANEL_DEFAULT_WIDTH;
  try {
    const raw = storageKey ? window.localStorage.getItem(storageKey) : null;
    return readDetailPanelWidth(raw ?? (legacyStorageKey ? window.localStorage.getItem(legacyStorageKey) : null));
  } catch { return DETAIL_PANEL_DEFAULT_WIDTH; }
}

export function persistStoredWidth(storageKey: string | undefined, width: number) {
  if (!storageKey || isServer) return;
  try { window.localStorage.setItem(storageKey, String(width)); } catch { /* Resizing remains usable without storage. */ }
}
