import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { ArrowUp, Button, CollapsibleSection, Composer, DataTable, GitBranch, Input, Link2, ListChecks, ScrollText, ShieldCheck, StatusChip } from "@polterware/frontend-design-system";
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
  const [slug, setSlug] = createSignal("");
  const [applied, setApplied] = createSignal(false);
  const [error, setError] = createSignal("");
  const ref = () => readRef(props.node);
  const state = () => referenceState(ref(), props.entities);
  const matches = createMemo(() => props.entities.filter((entity) => (!props.structureRequired || entity.kind === "node") && `${kindLabel(entity.kind)} ${entity.title} ${entity.slug ?? ""}`.toLowerCase().includes(search().toLowerCase())));
  function open(kind: PromotionKind) {
    setSlug(deriveSlug(props.node.name, props.entities.filter((e) => e.kind === kind).map((e) => e.slug ?? "")));
    setError(""); setApplied(false); setPromotion(kind);
  }
  /** Resolves false to keep the Composer open with the error under the title. */
  async function submit(title: string): Promise<boolean> {
    if (applied() || !promotion() || !props.promote) return false;
    setError("");
    try {
      const input = { kind: promotion()!, title, slug: slug(), canvasName: props.canvasName };
      promotionText(input); // Validate before contacting the core.
      const entity = await props.promote(input);
      setApplied(true); props.onLink(buildRef(entity)); setPromotion(undefined);
      return true;
    } catch (error) {
      if (error instanceof PromotionAppliedError) setApplied(true);
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  return <>
    {props.children}
    <CollapsibleSection title="Project reference" icon={<Link2 size={14} />}>
      {/* Only Structure kinds must be linked; an unlinked component or drawing shape is not unverified. */}
      <Show when={ref() || props.structureRequired}><div class="flex items-center gap-2"><StatusChip tone={state().trust === "referenced" ? "muted" : "warn"} label={ref() ? state().trust === "referenced" ? kindLabel(ref()!.kind) : "Missing reference / Unverified" : "Unverified"} />
        <Show when={ref() && !props.structureRequired}><Button size="sm" variant="ghost" onClick={() => props.onLink()}>Unlink</Button></Show>
      </div></Show>
      <Show when={ref()}><p class="text-sm text-[var(--color-text-primary)]">{state().title}</p>
        <Show when={!state().entity}><p class="text-xs text-[var(--color-text-muted)]">The referenced entity is missing from the loaded project data. It may have been deleted or excluded by the current scope.</p></Show>
      </Show>
      <Show when={props.structureRequired}><p class="text-xs text-[var(--color-text-muted)]">This shape requires a Structure reference. Choose another Structure node to replace it.</p></Show>
      <Input aria-label="Search project entities" placeholder={props.structureRequired ? "Search Structure" : "Search cards, Decisions, Rules or Structure"} value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
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
    <Composer
      open={!!promotion()}
      crumbs={[props.canvasName, `Promote to ${kindLabel(promotion() ?? "card")}`]}
      titlePlaceholder="Title"
      fields={promotion() === "card" || promotion() === "fact" ? [{ id: "slug", label: "Slug", placeholder: "lowercase-kebab", value: slug(), onChange: setSlug }] : undefined}
      body={<>
        <p class="text-xs text-[var(--color-text-muted)]">{promotion() === "card" ? "Stage: Idea" : promotion() === "decision" ? "Status: Proposed. The core assigns a Decision number." : "Agents keep the code to it."}</p>
        <Show when={error()}><p role="alert" class="mt-2 text-sm text-[var(--color-danger)]">{error()}</p></Show>
      </>}
      initial={{ title: props.node.name }}
      createMore={false}
      canSubmit={!applied()}
      submitLabel="Promote"
      onClose={() => setPromotion(undefined)}
      onSubmit={(draft) => submit(draft.title)}
    />
  </>;
}
