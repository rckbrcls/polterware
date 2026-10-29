# Solid + vanilla `motion` recipes

Copy-ready patterns for Polterware's stack. Each replaces a React/framer-motion idiom
from fluid-functionalism. The worked reference is
`packages/frontend/design-system/src/switch.tsx`; tokens live in
`packages/frontend/design-system/src/springs.ts` (export `spring`).

Contents: mental model · tokens · motion values that paint · mount without animating ·
reduced motion · measured-height collapse · icon swap · presence/exit with Ark ·
fluid hover · gliding indicator · lists (`Index` vs `For`) · drag gestures · testing notes

## Mental model: framer-motion -> Solid

| framer-motion (React) | Here |
|---|---|
| `<motion.div animate={{x}} transition={spring.fast}>` | a `motionValue`, `animate(value, target, spring.fast)`, painted in `value.on("change", ...)` |
| `useMotionValue`, `useTransform` | `motionValue(initial)` from `motion`; derive by painting several values in one function |
| state -> re-render -> animate | a signal read inside `createEffect`; the effect calls `animate` |
| `AnimatePresence` / `exit` | CSS keyframes on Ark `data-state` (Ark waits for `animationend`), or keep mounted until `animate(...).finished` |
| `layout` / `layoutId` | measure with `offsetLeft/offsetWidth` and animate `x`/`width` yourself (indicator recipe) |
| `MotionConfig reducedMotion="user"` | check `matchMedia` where you call `animate`, plus `@media (prefers-reduced-motion: reduce)` in CSS |
| `key` remount | Solid `Index`/keyed identity; `For` with fresh objects remounts and kills the animation |

Solid components run once; only effects/handlers re-run. That is why a value read in the
component body never updates the animation: read it inside `createEffect`.

## Tokens

```ts
import { animate } from "motion";
import { spring } from "./springs"; // spring.fast | moderate | slow, each with .exit

animate(value, target, spring.moderate);                      // enter, interruptible
animate(value, target, { type: "tween", ...spring.moderate.exit, ease: "easeIn" }); // leave
```

Never write `{ duration: 0.2 }` inline. `spring.*` objects carry an extra `exit` key that
`motion` ignores; spread `.exit` for tweens.

## Motion values that paint one element

Several values (x, y, width, height) animate independently; one function writes them all
so the browser gets a single style update per frame.

```ts
import { animate, motionValue } from "motion";

const x = motionValue(0), y = motionValue(0), w = motionValue(0), h = motionValue(0);
let el: HTMLElement | undefined;

const paint = () => {
  if (!el) return;
  el.style.width = `${w.get()}px`;
  el.style.height = `${h.get()}px`;
  el.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0)`;
};

onMount(() => {
  const stops = [x, y, w, h].map((v) => v.on("change", paint));
  onCleanup(() => { for (const stop of stops) stop(); for (const v of [x, y, w, h]) v.stop(); });
});

createEffect(() => {
  const target = compute(props.checked, hovered(), pressed()); // read signals HERE
  animate(x, target.x, spring.moderate); // a new animate() on the same value keeps its velocity
  animate(w, target.w, spring.moderate);
});
```

- Animate `transform` for position; width/height only when small and bounded.
- Position elements at `left: 0; top: 0` and move them with `translate3d`.
- `will-change: transform` on long-lived moving parts only.

## Mount without animating

```ts
let mounted = false;
createEffect(() => {
  const target = compute();
  if (!mounted) { for (const [v, t] of pairs(target)) v.set(t); return; } // snap
  for (const [v, t] of pairs(target)) animate(v, t, spring.moderate);
});
onMount(() => { const id = requestAnimationFrame(() => { mounted = true; }); onCleanup(() => cancelAnimationFrame(id)); });
```

The first effect run happens before first paint, so it must snap; springs turn on after.

## Reduced motion

```ts
const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// at the call site: if (prefersReducedMotion()) { value.set(target); return; }
```

Keep opacity/colour fades; drop travel, scale, stretch. A shared helper does not exist yet;
when a second component needs it, add it to the design system (do not duplicate it).

## Measured-height collapse

```ts
const height = motionValue(0);
let panel!: HTMLElement; let inner!: HTMLElement; let opening = false;

createEffect(() => {
  const open = props.open;                       // this wrapper toggled -> spring
  opening = true;
  const to = open ? inner.offsetHeight : 0;      // offsetHeight, never "auto"
  if (!mounted || prefersReducedMotion()) height.set(to);
  else animate(height, to, open ? spring.fast : { type: "tween", ...spring.fast.exit });
});
// A child resized the content while open: snap, do not spring (no stacked springs).
new ResizeObserver(() => { if (props.open && !opening) height.set(inner.offsetHeight); }).observe(inner);
```

Keep the panel mounted while closing; set `hidden` only after the exit finishes. Fade opacity
slightly ahead of height. Existing example: `animateGroupHeight` in
`packages/features/architecture/src/structure-tree.ts` (WAAPI, CSS for the rest); prefer the
shared spring when touching it.

## Icon swap (two glyphs, one cell)

```tsx
const SHOWN = { opacity: 1, scale: 1, filter: "blur(0px)" };
const HIDDEN = { opacity: 0, scale: 0.6, filter: "blur(4px)" };
const enter = { type: "tween", duration: spring.fast.duration, ease: "easeOut" } as const;
const leave = { type: "tween", ...spring.fast.exit, ease: "easeIn" } as const;

let a!: HTMLElement, b!: HTMLElement;
createEffect(() => {
  const swapped = props.swapped;
  animate(a, swapped ? HIDDEN : SHOWN, swapped ? leave : enter);
  animate(b, swapped ? SHOWN : HIDDEN, swapped ? enter : leave);
});
<span class="grid" style={{ width: `${size}px`, height: `${size}px` }}>
  <span ref={a} class="col-start-1 row-start-1 flex"><CopyIcon /></span>
  <span ref={b} class="col-start-1 row-start-1 flex" style={HIDDEN_STYLE}><CheckIcon /></span>
</span>
```

Hugeicons only. Keep the accessible name stable (visually hidden live region text).

## Presence / exit with Ark

Ark Solid's `Presence` and popup parts wait for `animationend` before unmounting. So:
- **Simple popups** (menu, popover, tooltip, dialog, drawer): CSS keyframes keyed on
  `data-state="open|closed"`, enter with `--duration-control|--duration-enter`, exit with
  `--duration-fast`, `transform-origin` from `data-placement` (side-aware, so a flipped
  popup grows from its anchor). See `dropdown-menu.css`, `popover.css`, `dialog.css`.
- Keep named keyframes even under reduced motion (shorten them) so `animationend` still
  fires (`dialog.css` documents this).
- **JS-driven exit**: a raw `animate()` never emits `animationend`. Hold the region
  mounted with your own state: `await animate(...).finished` (or `.then`) then unmount,
  with a `setTimeout` fallback of `exitDuration + ~100ms` for throttled background tabs.

## Fluid hover for a list (Solid sketch)

Add to `packages/frontend/design-system/src/fluid-hover.ts(x)` and reuse everywhere; do not
copy it into features. Upstream reference: `registry/default/hooks/use-fluid-hover.ts` and
`registry/default/fluid-hover-highlight.tsx` (see component-index.md).

```ts
export type ItemRect = { top: number; left: number; width: number; height: number };
type Axis = "x" | "y" | "xy";

// Pure, testable: containing item wins; otherwise nearest centre.
export function pickNearest(axis: Axis, point: { x: number; y: number }, rects: (ItemRect | undefined)[],
  containerRect: DOMRect, scroll: { x: number; y: number }, isDisabled?: (i: number) => boolean) {
  let best: number | null = null, bestD = Infinity, containing: number | null = null;
  rects.forEach((r, i) => {
    if (!r || isDisabled?.(i)) return;
    const left = containerRect.left + r.left - scroll.x, top = containerRect.top + r.top - scroll.y;
    if (point.x >= left && point.x <= left + r.width && point.y >= top && point.y <= top + r.height) containing = i;
    const cx = left + r.width / 2, cy = top + r.height / 2;
    const d = axis === "y" ? Math.abs(point.y - cy) : axis === "x" ? Math.abs(point.x - cx) : Math.hypot(point.x - cx, point.y - cy);
    if (d < bestD) { bestD = d; best = i; }
  });
  return containing ?? best;
}
```

Hook shape: `createFluidHover(container: () => HTMLElement | undefined, { axis })` returns
`{ activeIndex, rects, isMeasured, session, registerItem(index, el), handlers }` where
`handlers` = `{ onPointerEnter (session++), onPointerMove (rAF-throttled pickNearest),
onPointerLeave (activeIndex = null), onClick (gap click routing) }`. Rows call
`registerItem(i, el)` in a ref and `onCleanup` unregisters. Measure with
`offsetTop/offsetLeft/offsetWidth/offsetHeight` (transform-immune) in one coalesced rAF pass
after registration and on `ResizeObserver`; gate the highlight on `isMeasured`.

Highlight: one `<div class="absolute left-0 top-0 pointer-events-none">` painted from four
motion values (`x,y,width,height`) springing on `spring.fast`, opacity fading 0.08s in and
`spring.fast.exit` out; on a fresh `session` start from `from ?? rect` at opacity 0.
Rows carry no `:hover` background of their own; content sits above via `relative`. Reduced
motion: snap position, keep the fade.

Where NOT to use it: rows with destructive click-anywhere behaviour, non-clickable cards,
lists that move while scrolling, or big empty gaps (see principles.md).

## Gliding indicator (tabs, segmented controls)

One pill positioned from the active tab's `offsetLeft/offsetWidth`, animated with two
motion values on `spring.moderate`:

```ts
createEffect(() => {
  const el = tabRefs.get(props.value); if (!el) return;
  const to = { x: el.offsetLeft, w: el.offsetWidth };
  if (!mounted || prefersReducedMotion()) { x.set(to.x); w.set(to.w); return; }
  animate(x, to.x, spring.moderate); animate(w, to.w, spring.moderate);
});
```

Observe the tablist with `ResizeObserver` and snap (`set`) on resize so the pill never
lags a reflow. Set the selected index optimistically on click so the pill moves at once.
Ark Tabs keeps roving tabindex and a11y; render the pill as a sibling behind the triggers.

## Lists: `Index` vs `For`

```tsx
// options are rebuilt on every state change -> rows must persist to animate
<Index each={options()}>{(option) => <SwitchRow checked={option().checked} ... />}</Index>
```

`For` keys by reference: new objects mean new rows, so the thumb/indicator is destroyed and
the new one appears finished. Use `Index` (or a stable-key `For`) whenever a row animates
on a state that comes from a rebuilt array. Found in `filter-options-panel.tsx`,
`agent-setup-card.tsx`, `view-editor.tsx`.

## Drag gestures

Follow `switch.tsx`: `setPointerCapture` on pointerdown, 2px dead zone, `x.stop(); x.set()`
while dragging, decide at the midpoint on pointerup, `animate` to rest, capture-phase click
listener that swallows the click when `didDrag`, reset `didDrag` in `requestAnimationFrame`.
Hover only for `event.pointerType === "mouse"`. Do not spread your handlers over an Ark
part's props if it needs its own; attach to the Ark `Root` only after checking what Zag
binds there.

## Testing and measuring notes

- Sample the moving node with rAF + `getBoundingClientRect()` around a real click; compare
  to the tier curve (principles.md). Confirm the node identity did not change.
- A scratch Vite harness placed under `node_modules/` does not hot-reload; restart it.
- Playwright cannot hold the mouse button down, so press/drag need a manual check.
- Do not run any of this unless Erick asked for browser validation in the current request.
