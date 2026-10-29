import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { A11yDialog, ArrowUp, Button, CollapsibleSection, DataTable, Field, FormStack, GitBranch, Input, Link2, ListChecks, ScrollText, ShieldCheck, StatusChip } from "@polterware/frontend-design-system";
import { buildRef, canPromote, kindLabel, readRef, referenceState, type CanvasRef, type StoreEntity } from "./references";
import { deriveSlug, PromotionAppliedError, promotionText, type PromotionInput, type PromotionKind } from "./promotion";
import type { ArchNode } from "@polterware/frontend-canvas";

export function EntityIcon(props: { kind: string }) {
  return <Show when={props.kind === "card"} fallback={<Show when={props.kind === "decision"} fallback={<Show when={props.kind === "node"} fallback={<ScrollText size={14} />}><GitBranch size={14} /></Show>}><ShieldCheck size={14} /></Show>}><ListChecks size={14} /></Show>;
}

export function NodeInspector(props: {
  node: ArchNode; entities: readonly StoreEntity[]; canvasName: string;
  onLink: (ref?: CanvasRef) => void;
  promote?: (input: PromotionInput) => Promise<StoreEntity>;
  structureRequired?: boolean;
  children?: JSX.Element;
}) {
  const [search, setSearch] = createSignal("");
  const [promotion, setPromotion] = createSignal<PromotionKind>();
  const [title, setTitle] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [applied, setApplied] = createSignal(false);
  const [error, setError] = createSignal("");
  const ref = () => readRef(props.node);
  const state = () => referenceState(ref(), props.entities);
  const matches = createMemo(() => props.entities.filter((entity) => (props.structureRequired ? entity.kind === "node" : entity.kind !== "evidence") && `${kindLabel(entity.kind)} ${entity.title} ${entity.slug ?? ""}`.toLowerCase().includes(search().toLowerCase())));
  function open(kind: PromotionKind) {
    setTitle(props.node.name); setSlug(deriveSlug(props.node.name, props.entities.filter((e) => e.kind === kind).map((e) => e.slug ?? "")));
    setError(""); setApplied(false); setPromotion(kind);
  }
  async function submit() {
    if (busy() || applied() || !promotion() || !props.promote) return;
    setBusy(true); setError("");
    try {
      const input = { kind: promotion()!, title: title(), slug: slug(), canvasName: props.canvasName };
      promotionText(input); // Validate before contacting the core.
      const entity = await props.promote(input);
      setApplied(true); props.onLink(buildRef(entity)); setPromotion(undefined);
    } catch (error) {
      if (error instanceof PromotionAppliedError) setApplied(true);
      setError(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }
  return <>
    {props.children}
    <CollapsibleSection title="Project reference" icon={<Link2 size={14} />}>
      {/* Only Structure kinds must be linked; an unlinked component or drawing shape is not unverified. */}
      <Show when={ref() || props.structureRequired}><div class="flex items-center gap-2"><StatusChip tone={state().trust === "referenced" ? "muted" : "warn"} label={ref() ? state().trust === "referenced" ? kindLabel(ref()!.kind) : "Missing reference · Unverified" : "Unverified"} />
        <Show when={ref() && !props.structureRequired}><Button size="sm" variant="ghost" onClick={() => props.onLink()}>Unlink</Button></Show>
      </div></Show>
      <Show when={ref()}><p class="text-sm text-[var(--color-text-primary)]">{state().title}</p>
        <Show when={!state().entity}><p class="text-xs text-[var(--color-text-muted)]">The referenced entity is missing from the loaded project data. It may have been deleted or excluded by the current scope.</p></Show>
      </Show>
      <Show when={props.structureRequired}><p class="text-xs text-[var(--color-text-muted)]">This shape requires a Structure reference. Choose another Structure node to replace it.</p></Show>
      <Input aria-label="Search project entities" placeholder={props.structureRequired ? "Search Structure" : "Search cards, Decisions, Facts or Structure"} value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
      <div class="max-h-64 overflow-auto">
        <DataTable.Root rows={matches()} getRowId={(entity) => `${entity.kind}:${entity.id}`}>
          <DataTable.Table aria-label="Project entities">
            <DataTable.Header><DataTable.ColumnHeader id="title" sortBy={(entity) => entity.title}>Entity</DataTable.ColumnHeader></DataTable.Header>
            <DataTable.Body>{(entity) => <DataTable.Row row={entity} rowId={`${entity.kind}:${entity.id}`} aria-label={`Link ${kindLabel(entity.kind)}: ${entity.title}`} onActivate={() => props.onLink(buildRef(entity))}>
              <DataTable.Cell><span class="flex items-center gap-2"><EntityIcon kind={entity.kind} /><span>{entity.title}</span><span class="text-xs text-[var(--color-text-muted)]">{kindLabel(entity.kind)}</span></span></DataTable.Cell>
            </DataTable.Row>}</DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
        <Show when={!matches().length}><p class="text-xs text-[var(--color-text-muted)]">No matching project entities.</p></Show>
      </div>
    </CollapsibleSection>
    <Show when={canPromote(props.node)}><CollapsibleSection title="Promote" icon={<ArrowUp size={14} />}>
      <div class="flex flex-col items-start gap-1"><For each={["card", "decision", "fact"] as const}>{(kind) => <Button size="sm" variant="ghost" disabled={!props.promote} onClick={() => open(kind)}><EntityIcon kind={kind} />Promote to {kindLabel(kind)}</Button>}</For></div>
    </CollapsibleSection></Show>
    <A11yDialog open={!!promotion()} title={`Promote to ${kindLabel(promotion() ?? "card")}`} onClose={() => { if (!busy()) setPromotion(undefined); }} dismissible={!busy()}
      footer={<><Button variant="ghost" disabled={busy()} onClick={() => setPromotion(undefined)}>Cancel</Button><Button disabled={busy() || applied() || !title().trim()} onClick={() => void submit()}>{busy() ? "Promoting…" : "Promote"}</Button></>}>
      <FormStack>
        <Field label="Title"><Input aria-label="Promotion title" disabled={busy() || applied()} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} /></Field>
        <Show when={promotion() === "card" || promotion() === "fact"}><Field label="Slug"><Input aria-label="Promotion slug" disabled={busy() || applied()} value={slug()} onInput={(e) => setSlug(e.currentTarget.value)} /></Field></Show>
        <p class="text-xs text-[var(--color-text-muted)]">{promotion() === "card" ? "Stage: Shape" : promotion() === "decision" ? "Status: Proposed. The core assigns a Decision number." : "Kind: Declared"}</p>
      </FormStack>
      <Show when={error()}><p role="alert" class="mt-3 text-sm text-[var(--color-danger)]">{error()}</p></Show>
    </A11yDialog>
  </>;
}
