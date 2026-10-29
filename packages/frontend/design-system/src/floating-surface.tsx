import type { JSX } from "solid-js";
import { createContext, useContext } from "solid-js";

const FloatingSurfaceContext = createContext(false);

/**
 * Marks its subtree as a floating card surface (dialog, popover, drawer, floating window, detail panel).
 * Buttons inside it render the texture face instead of the keycap chrome.
 */
export function FloatingSurfaceProvider(props: { children: JSX.Element }) {
  return <FloatingSurfaceContext.Provider value={true}>{props.children}</FloatingSurfaceContext.Provider>;
}

export function useInFloatingSurface(): boolean {
  return useContext(FloatingSurfaceContext);
}

const TextureFaceContext = createContext(false);

/**
 * Makes every solid (keycap) button in its subtree, icon-only ones included, render the texture face.
 * An app wraps its root in it to keep keycaps in the library while its own surfaces use texture buttons.
 */
export function TextureFaceProvider(props: { children: JSX.Element }) {
  return <TextureFaceContext.Provider value={true}>{props.children}</TextureFaceContext.Provider>;
}

export function useTextureFace(): boolean {
  return useContext(TextureFaceContext);
}
