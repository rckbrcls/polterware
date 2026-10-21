import { createSignal } from "solid-js";
import { Button } from "./button";
import { IconSwap } from "./icon-swap";
import { Check, Pencil } from "./hugeicons";
import type { DocEntry } from "./docs/types";

function SwappableIcon() {
  const [swapped, setSwapped] = createSignal(false);
  return (
    // #region controlled
    <Button size="sm" onClick={() => setSwapped((value) => !value)}><IconSwap swapped={swapped()} from={<Pencil size={14} />} to={<Check size={14} />} />{swapped() ? "Saved" : "Save"}</Button>
    // #endregion
  );
}

export default {
  name: "Icon Swap",
  group: "Layout",
  summary: "IconSwap keeps two glyphs in a fixed cell and crossfades between them. It is decorative, so pair it with a visible label or another accessible control name.",
  exports: ["IconSwap"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <IconSwap swapped={false} from={<Pencil size={14} />} to={<Check size={14} />} />
      // #endregion
    ) },
    { id: "sizes", title: "Sizes", render: () => (
      // #region sizes
      <><IconSwap size={14} swapped from={<Pencil size={14} />} to={<Check size={14} />} /><IconSwap size={20} swapped from={<Pencil size={20} />} to={<Check size={20} />} /></>
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <SwappableIcon /> },
  ],
} satisfies DocEntry;
