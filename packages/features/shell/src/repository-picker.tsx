import { Show, createSignal } from "solid-js";
import { Folder, Plus } from "@polterware/frontend-design-system";
import "./repository-picker.css";

/**
 * Repository folder surface for create-project (ChatGPT-like empty square).
 * Empty: tall invite with Plus. Filled: path row with Change.
 */
export function RepositoryPicker(props: {
  value?: string;
  disabled?: boolean;
  "aria-label"?: string;
  onPick: () => Promise<string | null | undefined>;
  onChange?: (path: string) => void;
}) {
  const [picking, setPicking] = createSignal(false);
  const display = () => props.value?.trim() || "";
  const empty = () => display().length === 0;

  async function pick() {
    if (props.disabled || picking()) return;
    setPicking(true);
    try {
      const path = await props.onPick();
      if (path?.trim()) props.onChange?.(path.trim());
    } finally {
      setPicking(false);
    }
  }

  return (
    <button
      type="button"
      disabled={props.disabled || picking()}
      aria-label={props["aria-label"] ?? (empty() ? "Select a project folder" : "Change project folder")}
      class="pw-repository-picker pw-texture-button"
      data-empty={empty() ? "true" : "false"}
      data-picking={picking() ? "true" : "false"}
      onClick={() => {
        void pick();
      }}
    >
      <Show
        when={!empty()}
        fallback={
          <span class="pw-repository-picker__empty">
            <Plus
              size={22}
              class="pw-repository-picker__plus-icon"
              aria-hidden
            />
            <span class="pw-repository-picker__title">
              {picking() ? "Opening…" : "Select a project folder"}
            </span>
          </span>
        }
      >
        <span class="pw-repository-picker__filled">
          <Folder
            size={16}
            class="shrink-0 text-[var(--color-text-muted)]"
            aria-hidden
          />
          <span class="pw-repository-picker__path" title={display()}>
            {display()}
          </span>
          <span class="pw-repository-picker__action">
            {picking() ? "Opening…" : "Change"}
          </span>
        </span>
      </Show>
    </button>
  );
}
