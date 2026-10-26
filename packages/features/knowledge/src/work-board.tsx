import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  Card,
  Bot,
  Hammer,
  Check,
  ChevronDown,
  createDragMotion,
  createFluidHover,
  IconTile,
  FluidHoverHighlight,
  Pencil,
  Plus,
  Popover,
  Route,
  ShieldCheck,
  RadioButtonIcon,
  spring,
  type IconTileTone,
  type DragMotion,
  type FluidHover,
} from "@polterware/frontend-design-system";
import type { WorkStage, WorkspaceWorkCard, WorkspaceWorkBoard } from "@polterware/feature-shell";
import { WORK_STAGES, cardTaskProgress } from "./work-stage";
import { DRAG_DEAD_ZONE, columnAt, type ColumnSpan } from "./work-board-drag";
import "./work-board.css";

const STAGE_ICON: Record<WorkStage, typeof Check> = {
  shape: Pencil,
  plan: Route,
  build: Hammer,
  verify: ShieldCheck,
  delivered: Check,
};

/** One chart hue per stage, so the five lanes stay distinguishable. */
const STAGE_TILE: Record<WorkStage, { tone: IconTileTone; class: string }> = {
  shape: { tone: "knowledge", class: "!text-[var(--color-chart-amber)]" },
  plan: { tone: "architecture", class: "!text-[var(--color-chart-blue)]" },
  build: { tone: "infrastructure", class: "!text-[var(--color-chart-cyan)]" },
  verify: { tone: "identity", class: "!text-[var(--color-chart-violet)]" },
  delivered: { tone: "data", class: "!text-[var(--color-chart-green)]" },
};

/** What a card needs from the board while it is dragged; the board owns columns and moves. */
type BoardDrag = {
  /** Measure the columns once, at grab; never per pointermove. */
  begin: (slug: string) => { spans: ColumnSpan[]; bounds: DOMRect; scroller: HTMLElement } | null;
  target: (stage: WorkStage | null) => void;
  end: () => void;
  drop: (slug: string, stage: WorkStage, from: DOMRect) => void;
  register: (slug: string, element: HTMLElement) => () => void;
  /** Where a card that just changed column was on screen, once. */
  landing: (slug: string) => DOMRect | undefined;
};

/**
 * One active marker that springs between cards, across columns too; the hover only
 * lights the title (no travelling overlay). Cards drag between stage columns: the card
 * follows the pointer, and a drop moves it optimistically while the change is recorded.
 */
export function WorkBoard(props: {
  cards: readonly WorkspaceWorkCard[];
  /** Saved views currently all use WORK_STAGES; config does not define columns. */
  selectedBoard?: Pick<WorkspaceWorkBoard, "id" | "name">;
  activeSlug?: string | null;
  onActivate: (slug: string) => void;
  /** Persist a stage change; resolve `false` when it was cancelled or failed. */
  onMoveCard?: (slug: string, stage: WorkStage) => Promise<boolean> | void;
  /** Start a new card directly in a column. */
  onAddCard?: (stage: WorkStage) => void;
}) {
  let board: HTMLDivElement | undefined;
  // A board has generous whitespace: gap clicks land only within 16px of the lit card.
  const hover = createFluidHover(() => board, { axis: "xy", gapClick: { maxDistance: 16 } });
  const [pending, setPending] = createSignal<ReadonlyMap<string, WorkStage>>(new Map());
  const [draggingSlug, setDraggingSlug] = createSignal<string | null>(null);
  const [dropStage, setDropStage] = createSignal<WorkStage | null>(null);
  const elements = new Map<string, HTMLElement>();
  const landings = new Map<string, DOMRect>();

  const cardsBySlug = createMemo(() => new Map(props.cards.map((card) => [card.slug, card])));
  // Slugs, not card objects: a refetch rebuilds the objects but keeps every card's node.
  const columns = createMemo(() => {
    const bySlug = cardsBySlug();
    const byStage = new Map<WorkStage, string[]>(WORK_STAGES.map((stage) => [stage.id, []]));
    for (const card of props.cards) {
      byStage.get(pending().get(card.slug) ?? card.stage)?.push(card.slug);
    }
    return WORK_STAGES.map((stage) => ({
      ...stage,
      slugs: (byStage.get(stage.id) ?? []).filter((slug) => bySlug.has(slug)),
    }));
  });
  const columnOffsets = createMemo(() => {
    let offset = 0;
    return columns().map((column) => {
      const start = offset;
      offset += column.slugs.length;
      return start;
    });
  });
  // Once the store shows a card in the stage it was moved to, the optimistic entry is redundant.
  createEffect(() => {
    const bySlug = cardsBySlug();
    const current = pending();
    const next = new Map(current);
    for (const [slug, stage] of current) {
      const card = bySlug.get(slug);
      if (!card || card.stage === stage) next.delete(slug);
    }
    if (next.size !== current.size) setPending(next);
  });
  const clearPending = (slug: string) => {
    if (!pending().has(slug)) return;
    const next = new Map(pending());
    next.delete(slug);
    setPending(next);
  };

  const activeRect = () => {
    // The dragged card's marker would be left behind; it returns when the card lands.
    if (props.activeSlug && draggingSlug() === props.activeSlug) return null;
    let index = 0;
    for (const column of columns()) {
      for (const slug of column.slugs) {
        if (slug === props.activeSlug) return hover.rects()[index] ?? null;
        index++;
      }
    }
    return null;
  };

  const drag: BoardDrag = {
    begin: (slug) => {
      if (!board) return null;
      const scroller = board;
      const spans: ColumnSpan[] = [];
      for (const column of scroller.querySelectorAll<HTMLElement>(".pw-work-column")) {
        const stage = column.dataset.stage;
        if (!stage || !WORK_STAGES.some((item) => item.id === stage)) continue;
        const rect = column.getBoundingClientRect();
        spans.push({
          stage: stage as WorkStage,
          left: rect.left + scroller.scrollLeft,
          right: rect.right + scroller.scrollLeft,
        });
      }
      setDraggingSlug(slug);
      return { spans, bounds: scroller.getBoundingClientRect(), scroller };
    },
    target: setDropStage,
    end: () => {
      setDraggingSlug(null);
      setDropStage(null);
    },
    drop: (slug, stage, from) => {
      landings.set(slug, from);
      setPending(new Map(pending()).set(slug, stage));
      void Promise.resolve(props.onMoveCard?.(slug, stage)).then((saved) => {
        if (saved === false) {
          // Cancelled or failed: the card glides back from wherever it is on screen.
          const at = elements.get(slug)?.getBoundingClientRect();
          if (at) landings.set(slug, at);
          clearPending(slug);
        } else if (saved === true) {
          clearPending(slug);
        }
      });
    },
    register: (slug, element) => {
      elements.set(slug, element);
      return () => {
        if (elements.get(slug) === element) elements.delete(slug);
      };
    },
    landing: (slug) => {
      const rect = landings.get(slug);
      landings.delete(slug);
      return rect;
    },
  };

  return (
    <div ref={board} class="pw-work-board" role="list" aria-label={props.selectedBoard?.name ?? "Default board"} data-board-id={props.selectedBoard?.id ?? ""} {...hover.handlers}>
      {/* A card changing stage keeps its slug: the marker follows it without a spring. */}
      <FluidHoverHighlight
        class="pw-work-board-active"
        rect={activeRect()}
        targetKey={props.activeSlug ?? null}
        transition={spring.moderate}
      />
      <Index each={columns()}>
        {(column, columnIndex) => (
          <section
            class="pw-work-column"
            role="listitem"
            aria-label={column().label}
            data-stage={column().id}
            data-drop-target={dropStage() === column().id ? "true" : undefined}
          >
            <header class="pw-work-column__header">
              <span class="pw-work-column__label text-[12px] font-medium">
                <IconTile
                  size={20}
                  seed={`stage-${column().id}`}
                  tone={STAGE_TILE[column().id].tone}
                  class={STAGE_TILE[column().id].class}
                >
                  {(() => {
                    const Icon = STAGE_ICON[column().id];
                    return <Icon size={12} aria-hidden />;
                  })()}
                </IconTile>
                {column().label}
              </span>
              <span class="text-[12px] tabular-nums text-[var(--color-text-muted)]">
                {column().slugs.length}
              </span>
            </header>
            <div class="pw-work-column__cards">
              <Show
                when={column().slugs.length > 0}
                fallback={
                  <p class="m-0 px-1 py-2 text-[12px] text-[var(--color-text-muted)]">
                    No cards
                  </p>
                }
              >
                <For each={column().slugs}>
                  {(slug, index) => (
                    <WorkCard
                      card={cardsBySlug().get(slug) as WorkspaceWorkCard}
                      hover={hover}
                      index={(columnOffsets()[columnIndex] ?? 0) + index()}
                      active={props.activeSlug === slug}
                      draggable={Boolean(props.onMoveCard)}
                      drag={drag}
                      onActivate={() => props.onActivate(slug)}
                    />
                  )}
                </For>
              </Show>
              <Show when={props.onAddCard}>
                <button
                  type="button"
                  class="pw-work-column__add"
                  aria-label={`Add card to ${column().label}`}
                  title={`Add card to ${column().label}`}
                  onClick={() => props.onAddCard?.(column().id)}
                >
                  <Plus size={14} aria-hidden />
                </button>
              </Show>
            </div>
          </section>
        )}
      </Index>
    </div>
  );
}

function taskStatus(task: WorkspaceWorkCard["tasks"][number]): string {
  if (task.state === "done") return "Done";
  return task.claimHolder ? `Claimed by ${task.claimHolder}` : "Open";
}

function WorkCard(props: {
  card: WorkspaceWorkCard;
  hover: FluidHover;
  index: number;
  active: boolean;
  draggable: boolean;
  drag: BoardDrag;
  onActivate: () => void;
}) {
  const progress = createMemo(() => cardTaskProgress(props.card));
  const tasks = createMemo(() => props.card.tasks.filter((task) => task.state !== "dropped"));
  const [expanded, setExpanded] = createSignal(false);
  let element: HTMLDivElement | undefined;
  const [summaryButton, setSummaryButton] = createSignal<HTMLButtonElement>();
  const [lifted, setLifted] = createSignal(false);
  let motion: DragMotion | undefined;
  let session: {
    id: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    x: number;
    y: number;
    active: boolean;
    spans: ColumnSpan[];
    bounds: DOMRect;
    scroller: HTMLElement;
    target: WorkStage | null;
  } | null = null;
  let swallowClick = false;
  let edgeFrame = 0;
  onMount(() => {
    const card = element;
    if (!card) return;
    createEffect(() => onCleanup(props.hover.registerItem(props.index, card)));
    onCleanup(props.drag.register(props.card.slug, card));
    motion = createDragMotion(card);
    onCleanup(() => {
      cancelAnimationFrame(edgeFrame);
      window.removeEventListener("keydown", onEscape);
      motion?.stop();
    });
    // A card that changed column arrives at its new slot from where it was on screen.
    const from = props.drag.landing(props.card.slug);
    if (from) {
      const to = card.getBoundingClientRect();
      setLifted(true);
      motion.follow(from.left - to.left, from.top - to.top);
      void motion.settle().then(() => setLifted(false));
    }
  });
  createEffect(() => {
    if (element) element.dataset.lifted = lifted() ? "true" : "false";
  });

  const EDGE = 48;
  const EDGE_STEP = 14;
  const follow = () => {
    if (!session?.active) return;
    const { scroller, bounds } = session;
    const dx = session.x - session.startX + (scroller.scrollLeft - session.startLeft);
    const dy = session.y - session.startY + (scroller.scrollTop - session.startTop);
    motion?.follow(dx, dy);
    const inside =
      session.x >= bounds.left && session.x <= bounds.right
      && session.y >= bounds.top && session.y <= bounds.bottom;
    session.target = inside ? columnAt(session.spans, session.x + scroller.scrollLeft) : null;
    props.drag.target(session.target);
    if (!edgeFrame && inside && (session.x < bounds.left + EDGE || session.x > bounds.right - EDGE)) {
      edgeFrame = requestAnimationFrame(pump);
    }
  };
  // Near a side edge the board scrolls under the held card until the pointer moves away.
  const pump = () => {
    edgeFrame = 0;
    if (!session?.active) return;
    const { scroller, bounds } = session;
    const direction = session.x < bounds.left + EDGE ? -1 : session.x > bounds.right - EDGE ? 1 : 0;
    if (direction === 0) return;
    scroller.scrollLeft += direction * EDGE_STEP;
    follow();
  };
  const finish = (cancelled: boolean) => {
    const current = session;
    session = null;
    window.removeEventListener("keydown", onEscape);
    cancelAnimationFrame(edgeFrame);
    edgeFrame = 0;
    if (!current?.active) return;
    // The click that ends a drag must not open the card.
    swallowClick = true;
    requestAnimationFrame(() => {
      swallowClick = false;
    });
    props.drag.end();
    const stage = cancelled ? null : current.target;
    if (stage && stage !== props.card.stage && element) {
      props.drag.drop(props.card.slug, stage, element.getBoundingClientRect());
      return;
    }
    motion?.lift(false);
    void motion?.settle().then(() => setLifted(false));
  };
  function onEscape(event: KeyboardEvent) {
    if (event.key === "Escape") finish(true);
  }
  const onPointerDown = (event: PointerEvent) => {
    if (!props.draggable || event.button !== 0 || session) return;
    session = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: 0,
      startTop: 0,
      x: event.clientX,
      y: event.clientY,
      active: false,
      spans: [],
      bounds: new DOMRect(),
      scroller: document.body,
      target: null,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!session || event.pointerId !== session.id) return;
    session.x = event.clientX;
    session.y = event.clientY;
    if (!session.active) {
      if (Math.hypot(session.x - session.startX, session.y - session.startY) < DRAG_DEAD_ZONE) return;
      const started = props.drag.begin(props.card.slug);
      if (!started) return;
      Object.assign(session, {
        active: true,
        spans: started.spans,
        bounds: started.bounds,
        scroller: started.scroller,
        startLeft: started.scroller.scrollLeft,
        startTop: started.scroller.scrollTop,
      });
      setLifted(true);
      motion?.lift(true);
      window.addEventListener("keydown", onEscape);
    }
    follow();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (session && event.pointerId === session.id) finish(false);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (session && event.pointerId === session.id) finish(true);
  };

  return (
    <Card
      ref={element}
      class={[
        "pw-work-card !p-0",
        props.active ? "pw-work-card--active" : "",
      ].join(" ")}
    >
      <div class="pw-work-card__head">
        <button
          type="button"
          class="pw-work-card__button"
          data-detail-opener
          data-detail-target-id={props.card.slug}
          aria-pressed={props.active ? "true" : "false"}
          aria-roledescription={props.draggable ? "draggable card" : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={() => {
            if (!swallowClick) props.onActivate();
          }}
        >
          <span class="pw-work-card__text">
            <span class="pw-work-card__title">{props.card.title}</span>
            <span class="pw-work-card__slug font-mono">{props.card.slug}</span>
          </span>
        </button>
      </div>
      <Show when={tasks().length > 0}>
        <div class="pw-work-card__expandable">
          <button
            ref={setSummaryButton}
            type="button"
            class="pw-work-card__summary"
            aria-haspopup="dialog"
            aria-expanded={expanded()}
            data-state={expanded() ? "open" : "closed"}
            onClick={() => setExpanded((value) => !value)}
          >
            <span>Tasks {progress().done}/{progress().total}</span>
            <ChevronDown size={14} aria-hidden />
          </button>
          <Popover
            open={expanded()}
            onClose={() => setExpanded(false)}
            title={`${props.card.title} tasks`}
            anchorRef={summaryButton}
            placement="bottom-start"
            width={280}
          >
            <ul class="pw-work-card__tasks" aria-label={`${props.card.title} tasks`}>
              <For each={tasks()}>
                {(task) => (
                  <li class="pw-work-card__task" data-state={task.state}>
                    <span class="pw-work-card__task-mark" aria-hidden="true">
                      {task.state === "done" ? (
                        <Check size={12} />
                      ) : task.claimHolder ? (
                        <Bot size={12} />
                      ) : (
                        <RadioButtonIcon size={12} />
                      )}
                    </span>
                    <span class="pw-work-card__task-body">
                      <span class="pw-work-card__task-title">{task.title}</span>
                      <span class="pw-work-card__task-meta">
                        <span class="font-mono">T{task.number}</span>
                        <span>{taskStatus(task)}</span>
                        <Show when={task.scope}>
                          <span class="pw-work-card__task-scope font-mono" title={task.scope}>
                            {task.scope}
                          </span>
                        </Show>
                      </span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Popover>
        </div>
      </Show>
    </Card>
  );
}
