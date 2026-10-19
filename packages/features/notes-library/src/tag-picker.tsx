import { For, Show, createMemo, createSignal } from "solid-js";
import { PlusIcon, Popover, XIcon } from "@polterware/frontend-design-system";
import type { TagJSON } from "./model";

export type TagPickerProps = {
  tags: readonly TagJSON[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  /** Creates a tag from the typed name and resolves its id. */
  onCreate: (name: string) => Promise<string | undefined>;
};

/** Selected tags as removable badges plus an "Add tag" badge that opens a filtering suggestion list. */
export function TagPicker(props: TagPickerProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const selected = createMemo(() => props.tags.filter(tag => tag.id && props.selectedIds.includes(tag.id)));
  const needle = () => query().trim().toLowerCase();
  const matches = createMemo(() => props.tags.filter(tag => tag.id && !props.selectedIds.includes(tag.id) && (tag.name ?? "").toLowerCase().includes(needle())));
  const canCreate = () => needle() !== "" && !props.tags.some(tag => (tag.name ?? "").toLowerCase() === needle());
  const close = () => { setOpen(false); setQuery(""); };
  const add = (id: string) => { props.onChange([...props.selectedIds, id]); close(); };
  const remove = (id: string) => props.onChange(props.selectedIds.filter(value => value !== id));
  async function create() {
    const id = await props.onCreate(query());
    if (id) add(id);
  }
  const [active, setActive] = createSignal(0);
  const rows = createMemo(() => [
    ...matches().map(tag => ({ key: tag.id!, label: tag.name ?? "Unnamed tag", create: false })),
    ...(canCreate() ? [{ key: "__create", label: `Create “${query().trim()}”`, create: true }] : []),
  ]);
  const choose = (index: number) => {
    const row = rows()[index];
    if (!row) return;
    if (row.create) void create(); else add(row.key);
  };
  return <div class="flex min-w-0 flex-wrap items-center gap-1.5" data-note-tags>
    <For each={selected()}>{tag => (
      <span class="pw-tag-badge">
        <span class="min-w-0 truncate">{tag.name}</span>
        <button type="button" class="pw-tag-badge__remove" aria-label={`Remove tag ${tag.name}`} onClick={() => remove(tag.id!)}><XIcon size={10} /></button>
      </span>
    )}</For>
    <Show when={open()} fallback={
      <button type="button" class="pw-tag-badge pw-tag-badge--add" onClick={() => setOpen(true)}>
        <PlusIcon size={10} /> Add tag
      </button>
    }>
      <span ref={setAnchor} class="pw-tag-badge pw-tag-badge--editing">
        <PlusIcon size={10} />
        <input ref={element => queueMicrotask(() => element.focus())} class="pw-tag-badge__input" aria-label="Search or create tag"
          placeholder="Add tag" role="combobox" aria-expanded="true" aria-controls="note-tag-options"
          size={Math.max(7, query().length + 1)} value={query()}
          onInput={event => { setQuery(event.currentTarget.value); setActive(0); }}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); choose(active()); }
            else if (event.key === "Escape") { event.preventDefault(); close(); }
            else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const count = rows().length;
              if (count) setActive(value => (value + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
            }
          }} />
      </span>
      <Popover open={open()} onClose={close} anchorRef={anchor} width={220} placement="bottom-start" autoFocus={false} class="!rounded-[var(--radius-menu)]">
        <div id="note-tag-options" role="listbox" aria-label="Tags" class="pw-tag-options">
          <For each={rows()}>{(row, index) => (
            <button type="button" class="pw-tag-option" role="option" data-active={active() === index() ? "true" : "false"}
              aria-selected={active() === index()} onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActive(index())} onClick={() => choose(index())}>
              {row.create ? <PlusIcon size={12} /> : null}<span class="min-w-0 truncate">{row.label}</span>
            </button>
          )}</For>
          <Show when={!rows().length}>
            <span class="pw-tag-options__empty">Type to create a tag.</span>
          </Show>
        </div>
      </Popover>
    </Show>
  </div>;
}
