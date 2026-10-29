import { For, Show, createMemo, createSignal } from "solid-js";
import { A11yDialog, Kbd, SearchBar } from "@polterware/frontend-design-system";
import {
  createShortcutSelector,
  filterShortcutReference,
  shortcutReference,
  type ShortcutReferenceRow,
} from "@polterware/frontend-state";
import "./shortcuts-panel.css";

function ShortcutKeys(props: { row: ShortcutReferenceRow }) {
  return (
    <span class="pw-shortcuts-panel__keys">
      <For each={props.row.keys}>
        {(key, index) => (
          <>
            <Show when={index() > 0 && props.row.join !== "with"}>
              <span class="pw-shortcuts-panel__join">{props.row.join}</span>
            </Show>
            <Kbd>{key}</Kbd>
          </>
        )}
      </For>
    </span>
  );
}

/**
 * Every keyboard shortcut in one searchable list, opened with ⌘/ or ?: the rebindable
 * chords with the person's bindings, the G sequences, and the keys every list shares.
 */
export function ShortcutsPanel(props: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = createSignal("");
  const reference = createShortcutSelector((state) => shortcutReference(state.overrides));
  const groups = createMemo(() => filterShortcutReference(reference(), query()));

  return (
    <A11yDialog
      open={props.open}
      size="md"
      title="Keyboard shortcuts"
      onClose={() => {
        setQuery("");
        props.onClose();
      }}
    >
      <div class="pw-shortcuts-panel">
        <SearchBar class="!w-full !max-w-none" placeholder="Search shortcuts" value={query()} onInput={setQuery} autofocus />
        <Show
          when={groups().length > 0}
          fallback={<p class="pw-shortcuts-panel__empty">No shortcut matches “{query().trim()}”.</p>}
        >
          <For each={groups()}>
            {(group) => (
              <section class="pw-shortcuts-panel__group" aria-label={group.label}>
                <h3 class="pw-shortcuts-panel__heading">{group.label}</h3>
                <ul class="pw-shortcuts-panel__rows">
                  <For each={group.rows}>
                    {(row) => (
                      <li class="pw-shortcuts-panel__row">
                        <span class="pw-shortcuts-panel__label">{row.label}</span>
                        <ShortcutKeys row={row} />
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </Show>
      </div>
    </A11yDialog>
  );
}
