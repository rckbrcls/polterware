import { For } from "solid-js";
import { ToggleChip } from "@polterware/frontend-design-system";
import "./environment-kind-chips.css";

export type CreateProjectEnvironmentKind = "development" | "staging" | "production";

const ENV_OPTIONS: ReadonlyArray<{
  id: CreateProjectEnvironmentKind;
  label: string;
  tone: "muted" | "syncing" | "warn";
}> = [
  { id: "development", label: "Development", tone: "muted" },
  { id: "staging", label: "Staging", tone: "syncing" },
  { id: "production", label: "Production", tone: "warn" },
];

/**
 * Multi-select environment kind badges for create-project.
 * Quiet when off; StatusChip tone tokens when selected.
 */
export function EnvironmentKindChips(props: {
  value: ReadonlySet<CreateProjectEnvironmentKind> | CreateProjectEnvironmentKind[];
  onChange: (next: CreateProjectEnvironmentKind[]) => void;
  "aria-label"?: string;
}) {
  const selected = () => {
    const raw = props.value;
    return raw instanceof Set ? raw : new Set(raw);
  };

  function toggle(id: CreateProjectEnvironmentKind) {
    const next = new Set(selected());
    if (next.has(id)) {
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    props.onChange(ENV_OPTIONS.map((o) => o.id).filter((kind) => next.has(kind)));
  }

  return (
    <div
      class="pw-environment-kind-chips"
      role="group"
      aria-label={props["aria-label"] ?? "Initial environments"}
    >
      <For each={[...ENV_OPTIONS]}>
        {(option) => {
          const isOn = () => selected().has(option.id);
          return (
            <ToggleChip
              tone={option.tone}
              selected={isOn()}
              onClick={() => toggle(option.id)}
            >
              {option.label}
            </ToggleChip>
          );
        }}
      </For>
    </div>
  );
}
