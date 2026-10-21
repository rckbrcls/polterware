/**
 * Apply shell chrome from the boot query string before the first Solid paint.
 * Main passes `reduceTransparency=1|0` on the renderer URL so we avoid a
 * mid-startup flip when hydrateAppearancePreferences resolves over IPC.
 */
export function applyShellChromeFromBootQuery(
  search = typeof window !== "undefined" ? window.location.search : "",
): "vibrancy" | "solid" {
  const reduceTransparency =
    new URLSearchParams(search).get("reduceTransparency") === "1";
  const mode = reduceTransparency ? "solid" : "vibrancy";
  if (typeof document !== "undefined") {
    document.documentElement.dataset.shellChrome = mode;
  }
  return mode;
}
