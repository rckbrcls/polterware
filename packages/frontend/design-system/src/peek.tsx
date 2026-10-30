import { Show, type JSX } from "solid-js";
import { Button } from "./button";
import { A11yDialog } from "./dialog";
import { ExpandIcon, X } from "./hugeicons";
import "./peek.css";

export type PeekProps = {
  open: boolean;
  /** The entity's name: the large heading, and the dialog's accessible name. */
  title: string;
  onClose: () => void;
  /** Opens the entity's page: the Expand button at the top, and ⌘Enter. */
  onOpen?: () => void;
  /** A small tile before the kind line, such as the entity's icon tile. */
  icon?: JSX.Element;
  /** What the entity is, above its title, such as "Decision". */
  kind?: JSX.Element;
  /** Read-only property chips under the title, laid out like the Composer's pills. */
  properties?: JSX.Element;
  /** Actions on the entity in the footer, such as Edit. */
  actions?: JSX.Element;
  children?: JSX.Element;
};

/**
 * A quick look at an entity without leaving where you are, laid out like the Composer: the kind,
 * the title, its properties as chips, then a summary. Expand opens its page; Space (on the
 * summary) or Escape closes it, and focus goes back to what opened it.
 */
export function Peek(props: PeekProps) {
  return (
    <A11yDialog
      open={props.open}
      title={props.title}
      size="lg"
      chrome="flush"
      showCloseButton={false}
      bodyClass="pw-peek__body"
      autoFocusField={false}
      onClose={props.onClose}
      footer={props.actions}
    >
      <div
        class="pw-peek pw-selectable"
        onKeyDown={(event) => {
          if (event.key === " " && event.target === event.currentTarget) {
            event.preventDefault();
            props.onClose();
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && props.onOpen) {
            event.preventDefault();
            props.onOpen();
          }
        }}
      >
        <div class="pw-peek__top">
          <Show when={props.icon}>{props.icon}</Show>
          <span class="pw-peek__kind">{props.kind}</span>
          <div class="pw-peek__tools">
            <Show when={props.onOpen}>
              <Button size="icon" variant="ghost" aria-label="Expand" onClick={() => props.onOpen?.()}>
                <ExpandIcon size={14} />
              </Button>
            </Show>
            <Button size="icon" variant="ghost" aria-label="Close" onClick={props.onClose}>
              <X size={14} />
            </Button>
          </div>
        </div>
        <h2 class="pw-peek__title">{props.title}</h2>
        <Show when={props.properties}>
          <div class="pw-peek__properties" role="group" aria-label="Properties">{props.properties}</div>
        </Show>
        <Show when={props.children}>
          <div class="pw-peek__content">{props.children}</div>
        </Show>
      </div>
    </A11yDialog>
  );
}

/** A read-only property chip in a Peek, such as a state or a context. */
export function PeekChip(props: { icon?: JSX.Element; children: JSX.Element; title?: string }) {
  return (
    <span class="pw-peek__chip" title={props.title}>
      {props.icon}
      <span class="pw-peek__chip-label">{props.children}</span>
    </span>
  );
}

/** A labelled group in a Peek's summary, such as Open tasks. */
export function PeekSection(props: { title: string; children: JSX.Element }) {
  return (
    <section class="pw-peek__section">
      <h3 class="pw-peek__section-title">{props.title}</h3>
      {props.children}
    </section>
  );
}
