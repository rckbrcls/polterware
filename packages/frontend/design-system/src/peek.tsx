import { Show, type JSX } from "solid-js";
import { Button } from "./button";
import { A11yDialog } from "./dialog";

export type PeekProps = {
  open: boolean;
  /** The entity's name; also the dialog's accessible name. */
  title: string;
  onClose: () => void;
  /** Opens the entity's page; adds an "Open" action (Enter). */
  onOpen?: () => void;
  /** Actions on the entity, before Close in the footer, such as Edit. */
  actions?: JSX.Element;
  children: JSX.Element;
};

/**
 * A quick look at an entity without leaving the list: Space on a row opens it,
 * Space or Escape closes it, and focus goes back to the row.
 */
export function Peek(props: PeekProps) {
  return (
    <A11yDialog
      open={props.open}
      title={props.title}
      size="lg"
      autoFocusField={false}
      onClose={props.onClose}
      footer={
        <Show when={props.onOpen || props.actions}>
          {props.actions}
          <Button variant="ghost" onClick={props.onClose}>Close</Button>
          <Show when={props.onOpen}><Button variant="primary" onClick={() => props.onOpen?.()}>Open</Button></Show>
        </Show>
      }
    >
      <div
        class="pw-selectable"
        onKeyDown={(event) => {
          if (event.key === " " && event.target === event.currentTarget) {
            event.preventDefault();
            props.onClose();
          }
        }}
      >
        {props.children}
      </div>
    </A11yDialog>
  );
}
