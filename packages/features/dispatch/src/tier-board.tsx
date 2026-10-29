import { For, Index, Show, createMemo, createRoot, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import {
  Button,
  Card,
  Input,
  PageEmpty,
  ProgressBar,
  SearchBar,
  SegmentDisplay,
  Plus,
  X,
} from "@polterware/frontend-design-system";
import type { DispatchModelView, DispatchTierView } from "./dispatch-types";
import { TIER_COLUMNS, placeTierCard, removeTierCard, tierColumns, type TierCardInput, type TierSlot } from "./tier-board-model";
import "./tier-board.css";

type DragPayload = { card: TierCardInput; from?: TierSlot };

/*
 * Pointer drag instead of native HTML drag and drop: it behaves the same with a mouse, a trackpad and in
 * Electron, and it can carry a card from the palette window to the board. A press becomes a drag after a
 * few pixels of movement; the cell under the pointer is found by hit testing `[data-tier-slot]`.
 */
const DRAG_THRESHOLD = 4;
// The payload is set once per drag and the pointer on every move, so the ghost's avatar is created once
// instead of being rebuilt (and fading in again) on each pointer move.
const dragState = createRoot(() => {
  const [active, setActive] = createSignal<DragPayload | null>(null);
  const [pointer, setPointer] = createSignal({ x: 0, y: 0 });
  const [over, setOver] = createSignal("");
  return { active, setActive, pointer, setPointer, over, setOver };
});
let dropHandler: ((payload: DragPayload, slot: TierSlot) => void) | undefined;
// A press that turned into a drag must not also count as a click on the source.
let suppressClick = false;

function slotAt(x: number, y: number): TierSlot | undefined {
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tier-slot]");
  const [tier, index] = (cell?.dataset.tierSlot ?? "").split(":");
  return tier && index !== undefined ? { tier, index: Number(index) } : undefined;
}

function beginPointerDrag(event: PointerEvent, payload: DragPayload) {
  if (event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest("button:not([data-tier-drag-source]), input")) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  const move = (next: PointerEvent) => {
    if (!dragging && Math.hypot(next.clientX - startX, next.clientY - startY) < DRAG_THRESHOLD) return;
    next.preventDefault();
    dragState.setPointer({ x: next.clientX, y: next.clientY });
    if (!dragging) {
      dragging = true;
      document.documentElement.dataset.tierDragging = "";
      dragState.setActive(payload);
    }
    const slot = slotAt(next.clientX, next.clientY);
    dragState.setOver(slot ? `${slot.tier}:${slot.index}` : "");
  };
  const finish = (commit: boolean, at?: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key);
    delete document.documentElement.dataset.tierDragging;
    if (dragging) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const slot = commit && at ? slotAt(at.clientX, at.clientY) : undefined;
      if (slot) dropHandler?.(payload, slot);
    }
    dragState.setActive(null);
    dragState.setOver("");
  };
  const up = (next: PointerEvent) => finish(true, next);
  const key = (next: KeyboardEvent) => { if (next.key === "Escape") finish(false); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("keydown", key);
}

/** Speed and strength are 1–5 priors; zero means the table does not say. */
function TierMeter(props: { label: string; value: number; tone: "blue" | "violet" }) {
  const value = () => Math.max(0, Math.min(5, props.value));
  return (
    <div class="pw-tier-meter">
      <span class="text-[11px] text-[var(--color-text-secondary)]">{props.label}</span>
      <ProgressBar label={props.label} value={value() * 20} aria-valuetext={props.value > 0 ? `${value()} out of 5` : "not set"} tone={props.tone} size="sm" />
      <span class="text-right text-[11px] tabular-nums text-[var(--color-text-secondary)]">{props.value > 0 ? `${value()}/5` : "—"}</span>
    </div>
  );
}

function TierCard(props: {
  tier: DispatchTierView;
  slot: TierSlot;
  editable: boolean;
  dimmed: boolean;
  avatar: (agent: string) => JSX.Element;
  onRemove: () => void;
}) {
  const lifted = () => {
    const from = dragState.active()?.from;
    return from?.tier === props.slot.tier && from.index === props.slot.index;
  };
  return (
    <Card class={`pw-tier-card ${props.dimmed ? "pw-tier-card--dimmed" : ""} ${lifted() ? "pw-tier-card--lifted" : ""}`}>
      <div
        class="pw-tier-card__body"
        data-draggable={props.editable ? "" : undefined}
        aria-label={`${props.tier.agent} ${props.tier.model}`}
        onPointerDown={(event) => { if (props.editable) beginPointerDrag(event, { card: props.tier, from: props.slot }); }}
      >
        <div class="pw-tier-card__head">
          {props.avatar(props.tier.agent)}
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="pw-tier-card__model" title={props.tier.model}>{props.tier.model}</span>
            <span class="truncate text-[11px] text-[var(--color-text-muted)]">{[props.tier.agent, props.tier.provider].filter(Boolean).join(" / ")}</span>
          </div>
          <Show when={props.editable}>
            <Button variant="ghost" size="icon" aria-label={`Remove ${props.tier.agent} ${props.tier.model} from ${props.slot.tier}`} onClick={() => props.onRemove()}>
              <X size={14} aria-hidden />
            </Button>
          </Show>
        </div>
        <div class="pw-tier-card__meters">
          <TierMeter label="Speed" value={props.tier.speed} tone="blue" />
          <TierMeter label="Strength" value={props.tier.strength} tone="violet" />
        </div>
      </div>
    </Card>
  );
}

/** The card under the pointer while dragging. Opaque, and never a hit target. */
function TierDragGhost(props: { avatar: (agent: string) => JSX.Element }) {
  return (
    <Show when={dragState.active()}>
      {(drag) => (
        <Portal>
          <div class="pw-tier-ghost" style={{ transform: `translate3d(${dragState.pointer().x + 12}px, ${dragState.pointer().y + 12}px, 0)` }} aria-hidden="true">
            <Card class="pw-tier-ghost__card">
              {props.avatar(drag().card.agent)}
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-mono text-[13px] font-medium text-[var(--color-text-primary)]">{drag().card.model}</span>
                <span class="truncate text-[11px] text-[var(--color-text-muted)]">{drag().card.agent}</span>
              </span>
            </Card>
          </div>
        </Portal>
      )}
    </Show>
  );
}

/**
 * Routing tiers as a grid: each tier is a column and each row is an order position (row 1 runs
 * first, the rest are fallbacks). Cards move by dragging; new ones come from the model palette.
 */
export function TierBoard(props: {
  tiers: readonly DispatchTierView[];
  editable: boolean;
  /** Search: cards that do not match stay in place, dimmed. */
  matches?: (tier: DispatchTierView) => boolean;
  avatar: (agent: string) => JSX.Element;
  onChange: (next: DispatchTierView[]) => void;
}) {
  const columns = createMemo(() => tierColumns(props.tiers));
  // One extra row is always open, so a tier can grow by dropping below its last card.
  const rows = createMemo(() => Math.max(1, ...TIER_COLUMNS.map((column) => columns()[column.id]?.length ?? 0)) + (props.editable ? 1 : 0));

  onMount(() => {
    dropHandler = (payload, slot) => {
      if (payload.from && payload.from.tier === slot.tier && payload.from.index === slot.index) return;
      props.onChange(placeTierCard(props.tiers, payload.card, slot, payload.from));
    };
  });
  onCleanup(() => { dropHandler = undefined; });

  return (
    <div class="pw-tier-board" role="grid" data-floating-window-opener="" aria-label="Routing tiers" aria-rowcount={rows() + 1}>
      <div class="pw-tier-board__row" role="row">
        <span class="pw-tier-board__corner" role="columnheader"><span class="sr-only">Order</span></span>
        <For each={TIER_COLUMNS}>
          {(column) => (
            <div class="pw-tier-board__head" role="columnheader">
              <span class="text-[13px] font-semibold text-[var(--color-text-primary)]">{column.label}</span>
              <span class="text-[11px] tabular-nums text-[var(--color-text-muted)]">{columns()[column.id]?.length ?? 0}</span>
            </div>
          )}
        </For>
      </div>
      <Index each={Array.from({ length: rows() }, (_, index) => index)}>
        {(row) => (
          <div class="pw-tier-board__row" role="row">
            <div class="pw-tier-board__order" role="rowheader">
              <SegmentDisplay value={`#${row() + 1}`} size={22} aria-label={`Position ${row() + 1}`} />
              <span class="text-[11px] text-[var(--color-text-muted)]">{row() === 0 ? "Primary" : "Fallback"}</span>
            </div>
            <For each={TIER_COLUMNS}>
              {(column) => {
                const slot = () => ({ tier: column.id, index: row() });
                const key = () => `${column.id}:${row()}`;
                const tier = () => columns()[column.id]?.[row()];
                const isNext = () => row() === (columns()[column.id]?.length ?? 0);
                return (
                  <div
                    class="pw-tier-board__cell"
                    role="gridcell"
                    data-tier-slot={props.editable ? key() : undefined}
                    data-drop-over={dragState.over() === key() ? "" : undefined}
                  >
                    <Show
                      when={tier()}
                      fallback={
                        <Show when={props.editable}>
                          <div class="pw-tier-board__empty" data-next={isNext() ? "" : undefined}>
                            <Show when={isNext()}>Drop a model</Show>
                          </div>
                        </Show>
                      }
                    >
                      {(item) => (
                        <TierCard
                          tier={item()}
                          slot={slot()}
                          editable={props.editable}
                          dimmed={props.matches ? !props.matches(item()) : false}
                          avatar={props.avatar}
                          onRemove={() => props.onChange(removeTierCard(props.tiers, slot()))}
                        />
                      )}
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        )}
      </Index>
      <TierDragGhost avatar={props.avatar} />
    </div>
  );
}

/**
 * The model palette, shown inside the Tiers floating window: the models the installed agents report.
 * Rows drag onto the board; a click adds the model at the end of the tier the agent suggests.
 */
export function TierModelPalette(props: {
  models: readonly DispatchModelView[];
  loading: boolean;
  problems: readonly string[];
  onAdd: (card: TierCardInput, tier: string) => void;
  avatar: (agent: string) => JSX.Element;
}) {
  const [query, setQuery] = createSignal("");
  const [customAgent, setCustomAgent] = createSignal("");
  const [customModel, setCustomModel] = createSignal("");

  const groups = createMemo(() => {
    const needle = query().trim().toLowerCase();
    const byAgent = new Map<string, DispatchModelView[]>();
    for (const model of props.models) {
      if (needle && ![model.agent, model.model, model.provider].some((value) => value.toLowerCase().includes(needle))) continue;
      byAgent.set(model.agent, [...(byAgent.get(model.agent) ?? []), model]);
    }
    return [...byAgent.entries()].sort(([a], [b]) => a.localeCompare(b));
  });
  const cardOf = (model: Pick<DispatchModelView, "agent" | "model" | "provider">): TierCardInput => ({ agent: model.agent, model: model.model, provider: model.provider, speed: 0, strength: 0 });
  const suggestedTier = (tier: string) => (TIER_COLUMNS.some((column) => column.id === tier) ? tier : "normal");

  return (
    <div class="pw-tier-palette">
      <SearchBar placeholder="Search models…" aria-label="Search models" value={query()} onInput={setQuery} class="!w-full !max-w-none" />
      <div class="pw-tier-palette__list" role="list" aria-label="Models">
        <Show
          when={!props.loading}
          fallback={<p class="m-0 p-2 text-[12px] text-[var(--color-text-muted)]">Asking the installed agents for their models…</p>}
        >
          <For each={groups()} fallback={<PageEmpty title={query().trim() ? "No matches" : "No models listed"} mood={query().trim() ? "lost" : "sleeping"} />}>
            {([agent, models]) => (
              <div class="flex flex-col gap-1">
                <span class="px-1 text-[11px] font-medium text-[var(--color-text-muted)]">{agent}</span>
                <For each={models}>
                  {(model) => (
                    <button
                      type="button"
                      role="listitem"
                      class="pw-tier-palette__item"
                      data-tier-drag-source=""
                      onPointerDown={(event) => beginPointerDrag(event, { card: cardOf(model) })}
                      onClick={() => { if (!suppressClick) props.onAdd(cardOf(model), suggestedTier(model.tier)); }}
                      title={`${model.agent} / ${model.model}`}
                    >
                      {props.avatar(model.agent)}
                      <span class="flex min-w-0 flex-1 flex-col text-left">
                        <span class="truncate font-mono text-[12px] text-[var(--color-text-primary)]">{model.model}</span>
                        <span class="truncate text-[11px] text-[var(--color-text-muted)]">{[model.provider, model.tier].filter(Boolean).join(" / ")}</span>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={props.problems.length > 0}>
        <ul class="m-0 list-disc pl-4 text-[11px] text-[var(--color-text-muted)]">
          <For each={props.problems}>{(problem) => <li>{problem}</li>}</For>
        </ul>
      </Show>
      <form
        class="pw-tier-palette__custom"
        onSubmit={(event) => {
          event.preventDefault();
          const agent = customAgent().trim();
          const model = customModel().trim();
          if (!agent || !model) return;
          props.onAdd(cardOf({ agent, model, provider: "" }), "normal");
          setCustomModel("");
        }}
      >
        <div class="pw-tier-palette__pair control-field pw-field-control control-field-sm">
          <Input aria-label="Agent" placeholder="Agent" value={customAgent()} onInput={(event) => setCustomAgent(event.currentTarget.value)} />
          <span class="pw-tier-palette__divider" aria-hidden="true" />
          <Input aria-label="Model" placeholder="Model" value={customModel()} onInput={(event) => setCustomModel(event.currentTarget.value)} />
        </div>
        <Button type="submit" size="icon" class="rounded-full" aria-label="Add custom model" disabled={!customAgent().trim() || !customModel().trim()}>
          <Plus size={14} />
        </Button>
      </form>
    </div>
  );
}
