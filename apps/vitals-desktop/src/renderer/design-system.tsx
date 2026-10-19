import { DesignSystemProvider, useDesignSystem } from "@polterware/frontend-design-system";
import type { JSX } from "solid-js";

/** Ctrl+B inside the terminal belongs to the remote shell (tmux prefix, readline); only Cmd chords reach the shared shortcuts there. */
function isTerminalCtrlChord(event: KeyboardEvent) {
  if (!event.ctrlKey || event.metaKey) return false;
  return event.target instanceof Element && event.target.closest(".vitals-terminal-pane") !== null;
}

export function VitalsDesignSystemProvider(props: { storagePrefix: string; children: JSX.Element }) {
  const base = useDesignSystem();
  return (
    <DesignSystemProvider
      storagePrefix={props.storagePrefix}
      matchesShortcut={(id, event) => !isTerminalCtrlChord(event) && base.matchesShortcut(id, event)}
    >
      {props.children}
    </DesignSystemProvider>
  );
}
