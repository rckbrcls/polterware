/** Hidden page roots must not receive global input. */
export function isPanelVisible(root: HTMLElement | undefined, options: { allowModalBackground?: boolean } = {}): boolean {
  if (!root?.isConnected) return false;
  for (let element: HTMLElement | null = root; element; element = element.parentElement) {
    // Ark hides modal backgrounds from assistive technology without hiding their pixels.
    const ariaHidden = element.getAttribute("aria-hidden") === "true"
      && !(options.allowModalBackground && element.hasAttribute("data-aria-hidden"));
    if (element.hidden || element.hasAttribute("inert") || ariaHidden) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
}
