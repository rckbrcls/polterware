import { For, Show, createEffect, createSignal } from "solid-js";
import type { ArchNode, ArchitectureDocument } from "@polterware/frontend-canvas";
import { Button, DatePicker, DetailPanel, Field, FormStack, Input, Pencil, Select, parseDate } from "@polterware/frontend-design-system";
import { colorTags } from "./types/brainstorm";
import { itemTimed } from "./types/roadmap";
import { properties, type InspectorField } from "./types/shared";

function dateValue(value: unknown) {
  try { return typeof value === "string" && value ? [parseDate(value)] : []; }
  catch { return []; }
}
/** Stage property edits together so an incomplete date pair never reaches autosave. */
export function TypeInspector(props: {
  node: ArchNode; document: ArchitectureDocument; fields: readonly InspectorField[]; type: string;
  onApply: (values: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = createSignal<Record<string, unknown>>({});
  createEffect(() => setDraft({ ...properties(props.node) }));
  const text = (key: string) => typeof draft()[key] === "string" ? String(draft()[key]) : "";
  const set = (key: string, value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  const valid = () => props.type !== "roadmap" || props.node.type !== "item" || itemTimed(draft());
  return <Show when={props.fields.length}><DetailPanel.Section title="Shape properties" icon={<Pencil size={14} />}>
    <FormStack><For each={props.fields}>{(field) => <Show when={field.kind === "date"} fallback={<Field label={field.label}>
      <Show when={field.kind === "lane" || field.kind === "color"} fallback={<Input aria-label={field.label} value={text(field.key)} onInput={(event) => set(field.key, event.currentTarget.value)} />}>
        <Select aria-label={field.label} value={text(field.key)} onChange={(value) => set(field.key, value)} options={field.kind === "lane"
          ? [{ value: "", label: "Unassigned" }, ...props.document.nodes.filter((node) => node.type === "lane").map((node) => ({ value: node.id, label: node.name || "Lane" }))]
          : colorTags.map((value) => ({ value, label: value }))} />
      </Show>
    </Field>}>
      <DatePicker label={field.label} value={dateValue(draft()[field.key])} onValueChange={(details) => set(field.key, details.value[0]?.toString() ?? "")} />
    </Show>}</For></FormStack>
    <Show when={props.type === "roadmap" && props.node.type === "item"}><p class="text-xs text-[var(--color-text-muted)]">Set both dates or a quarter. Dates determine horizontal position; the lane determines the row.</p></Show>
    <Show when={!valid()}><p role="status" class="text-xs text-[var(--color-warning)]">An item requires start and end, or a quarter.</p></Show>
    <Button size="sm" disabled={!valid()} onClick={() => props.onApply(draft())}>Apply properties</Button>
  </DetailPanel.Section></Show>;
}
