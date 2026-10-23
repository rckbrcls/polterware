const BOOT_SPLASH_ID = "boot-splash";
const LEAVE_FALLBACK_MS = 400;

/** Fade out and remove the boot splash. Safe to call more than once. */
export function hideBootSplash(options: { immediate?: boolean } = {}): void {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(BOOT_SPLASH_ID);
  if (!splash || splash.dataset.leaving === "true") return;
  if (options.immediate) {
    splash.remove();
    return;
  }
  splash.dataset.leaving = "true";
  const remove = () => splash.remove();
  splash.addEventListener("transitionend", remove, { once: true });
  window.setTimeout(remove, LEAVE_FALLBACK_MS);
}
