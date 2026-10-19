import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Layers,
  LayoutDashboard,
  Switch,
  Undo2,
} from "@polterware/frontend-design-system";
import { For } from "solid-js";
import { CARD_IDS, CARD_TITLES } from "./card-order";
import type { CardLayoutState } from "./card-layout-state";

/** Toolbar menu for the metrics grid: pick which cards show, pack them, or go back to the default. */
export function CardLayoutMenu(props: { layout: CardLayoutState }) {
  const layout = props.layout;
  const lastShown = (id: (typeof CARD_IDS)[number]) => {
    const shown = layout.shown();
    return shown.length === 1 && shown[0] === id;
  };
  return (
    <DropdownMenu positioning={{ placement: "bottom-end" }}>
      <DropdownMenuTrigger class="vitals-layout-trigger" aria-label="Layout" title="Layout">
        <LayoutDashboard size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="vitals-card-menu">
        <For each={CARD_IDS}>
          {(id) => (
            <DropdownMenuItem
              value={`card:${id}`}
              closeOnSelect={false}
              disabled={!layout.available().includes(id) || lastShown(id)}
              onSelect={() => layout.toggle(id)}
            >
              <span class="flex-1 truncate">{CARD_TITLES[id]}</span>
              {/* The item owns the toggle; the switch only mirrors it. */}
              <span class="pointer-events-none" aria-hidden="true">
                <Switch
                  size="sm"
                  checked={!layout.isHidden(id)}
                  disabled={!layout.available().includes(id) || lastShown(id)}
                  onCheckedChange={() => {}}
                />
              </span>
            </DropdownMenuItem>
          )}
        </For>
        <DropdownMenuSeparator />
        <DropdownMenuItem value="auto-layout" onSelect={() => layout.autoLayout()}>
          <Layers size={14} aria-hidden />
          Auto-layout
        </DropdownMenuItem>
        <DropdownMenuItem value="reset-layout" onSelect={() => layout.reset()}>
          <Undo2 size={14} aria-hidden />
          Reset layout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
