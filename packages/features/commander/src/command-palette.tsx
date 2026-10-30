import { A11yDialog, Button, X, type ComposerProperty } from "@polterware/frontend-design-system";
import type { PlatformContext } from "@polterware/frontend-platform";
import { PaletteBody } from "./palette-body";
import type { PaletteItem } from "./palette-items";
import "./commander.css";

/** In-app Commander — same chrome as the global overlay; overview cards stay global-only. */
export function CommandPalette(props: {
  open: boolean;
  onClose: () => void;
  onCommand?: (id: string) => void;
  items?: PaletteItem[];
  platform?: PlatformContext;
  /** Route, Milestone, and Card for Run an agent. */
  runProperties?: readonly ComposerProperty[];
}) {
  return (
    <A11yDialog
      open={props.open}
      onClose={props.onClose}
      title="Command palette"
      chrome="flush"
      showCloseButton={false}
      class="commander-panel"
      bodyClass="px-0 pb-3"
    >
      <PaletteBody
        items={props.items}
        platform={props.platform}
        onCommand={props.onCommand}
        onConsumed={props.onClose}
        runAgent
        runProperties={props.runProperties}
        trailing={
          <Button
            variant="icon"
            class="commander-action"
            aria-label="Close"
            onMouseDown={(event) => {
              event.preventDefault();
              props.onClose();
            }}
          >
            <X size={16} aria-hidden />
          </Button>
        }
      />
    </A11yDialog>
  );
}
