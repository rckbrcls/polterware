import { For, Show, createEffect, createSignal } from "solid-js";
import type { ArchNode } from "@polterware/frontend-canvas";
import { Button, CollapsibleSection, Field, FormStack, Input, Pencil, Select } from "@polterware/frontend-design-system";
import { colorTags } from "./style";
import { properties, type InspectorField } from "./types/shared";

/** Stage property edits together so one Apply writes a single undo step. */
export function TypeInspector(props: { node: ArchNode; fields: readonly InspectorField[]; onApply: (values: Record<string, unknown>) => void }) {
  const [draft, setDraft] = createSignal<Record<string, unknown>>({});
  createEffect(() => setDraft({ ...properties(props.node) }));
  const text = (key: string) => typeof draft()[key] === "string" ? String(draft()[key]) : "";
  const set = (key: string, value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  return <Show when={props.fields.length}><CollapsibleSection title="Shape properties" icon={<Pencil size={14} />}>
    <FormStack><For each={props.fields}>{(field) => <Field label={field.label}>
      <Show when={field.kind === "color"} fallback={<Input aria-label={field.label} value={text(field.key)} onInput={(event) => set(field.key, event.currentTarget.value)} />}>
        <Select aria-label={field.label} value={text(field.key)} onChange={(value) => set(field.key, value)} options={colorTags.map((value) => ({ value, label: value }))} />
      </Show>
    </Field>}</For></FormStack>
    <Button size="sm" onClick={() => props.onApply(draft())}>Apply properties</Button>
  </CollapsibleSection></Show>;
}
