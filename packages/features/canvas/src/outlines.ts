/** Outline paths in a w×h box at the origin, shared by the drawing library and the component silhouettes. */
export const rect = (w: number, h: number) => `M0 0H${w}V${h}H0Z`;
export const ellipse = (w: number, h: number) => `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`;
export const diamond = (w: number, h: number) => `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
export function rounded(w: number, h: number) { return roundedBy(12)(w, h); }
/** A rounded rectangle at (x, y) with at most `radius` corners. */
export function roundedAt(x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 4, h / 4);
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
export const roundedBy = (radius: number) => (w: number, h: number) => roundedAt(0, 0, w, h, radius);
export function stadium(w: number, h: number) {
  const r = Math.min(h / 2, w / 2);
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}
export const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
