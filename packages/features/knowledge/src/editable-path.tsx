import { Show, createSignal } from "solid-js";
import { Input } from "@polterware/frontend-design-system";

export function EditablePath(props: {
  value: string;
  onChange?: (path: string) => void;
}) {
  const [editing, setEditing] = createSignal(false);

  return (
    <Show
      when={editing() && props.onChange}
      fallback={
        <button
          type="button"
          class="pw-knowledge-path pw-selectable"
          classList={{ "font-mono": Boolean(props.value) }}
          data-empty={props.value ? undefined : ""}
          disabled={!props.onChange}
          title={props.value || (props.onChange ? "Path relative to the project root" : undefined)}
          onClick={() => setEditing(true)}
        >
          {props.value || (props.onChange ? "Set path" : "No path")}
        </button>
      }
    >
      <Input
        size="sm"
        class="pw-knowledge-path-control w-full font-mono"
        value={props.value}
        placeholder="path/relative/to/project-root"
        aria-label="Path relative to the project root"
        autofocus
        onInput={(event) => props.onChange?.(event.currentTarget.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
        }}
      />
    </Show>
  );
}
