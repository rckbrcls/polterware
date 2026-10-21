import { DragDropVerticalIcon, type HugeiconComponent } from "@polterware/frontend-design-system";
import { onCleanup, onMount, type JSX } from "solid-js";
import type { Rect } from "./card-layout";
import type { CardId } from "./card-order";
import type { CardReorder } from "./card-reorder";

export function MetricCard(props: {
  id: CardId;
  title: string;
  icon: HugeiconComponent;
  reorder: CardReorder;
  rect?: Rect;
  trailing?: JSX.Element;
  children: JSX.Element;
}) {
  let element: HTMLElement | undefined;
  onMount(() => {
    if (element) onCleanup(props.reorder.register(props.id, element));
  });
  return (
    <section
      ref={element}
      class="vitals-section card-panel"
      style={
        props.rect
          ? {
              "grid-column": `${props.rect.x + 1} / span ${props.rect.w}`,
              "grid-row": `${props.rect.y + 1} / span ${props.rect.h}`,
            }
          : undefined
      }
      data-card={props.id}
      data-dragging={props.reorder.draggingId() === props.id ? "true" : "false"}
      data-lifted={props.reorder.liftedId() === props.id ? "true" : "false"}
    >
      <header class="vitals-card-head" onPointerDown={(event) => props.reorder.onHeaderPointerDown(props.id, event)}>
        <h2 class="vitals-card-title">
          <props.icon size={14} /> {props.title}
        </h2>
        <div class="vitals-card-actions">
          {props.trailing}
          <button
            type="button"
            class="vitals-card-grip"
            data-card-grip
            aria-label={`Move ${props.title} card. Drag the header or use the arrow keys.`}
            onKeyDown={(event) => props.reorder.onGripKeyDown(props.id, event)}
          >
            <DragDropVerticalIcon size={14} />
          </button>
        </div>
      </header>
      <div class="vitals-card-body pw-scroll-fade">{props.children}</div>
    </section>
  );
}
