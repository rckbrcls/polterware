export type MapTokenColors = {
  brand: string;
  canvas: string;
  text: string;
  muted: string;
};

const FALLBACK: MapTokenColors = {
  brand: "#eef1f3",
  canvas: "#131313",
  text: "#ececec",
  muted: "#6f6f6f",
};

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

export function mapTokenColors(element: HTMLElement | null): MapTokenColors {
  if (!element || typeof getComputedStyle !== "function") return FALLBACK;
  const styles = getComputedStyle(element);
  return {
    brand: readVar(styles, "--color-brand", FALLBACK.brand),
    canvas: readVar(styles, "--color-app-background", FALLBACK.canvas),
    text: readVar(styles, "--color-text-primary", FALLBACK.text),
    muted: readVar(styles, "--color-text-muted", FALLBACK.muted),
  };
}
