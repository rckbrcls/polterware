import { createMemo, createResource, createSignal, Show } from "solid-js";
import { CanvasView, type StoreEntity } from "@polterware/feature-canvas";
import { Button } from "@polterware/frontend-design-system";
import { readRemembered, writeRemembered } from "@polterware/frontend-state";
import type { WorkspaceSnapshot } from "./workspace/load";
import { canvasPersistence } from "./workspace/persist";
import { asObjectArray, asRecord, asString } from "./workspace/format";

/** Canvas references use renderer workspace records; Facts reload with that snapshot. */
export function CanvasWorkspace(props: { projectId: string; workspace: WorkspaceSnapshot; onReload: () => Promise<void> }) {
  const [reloadError, setReloadError] = createSignal("");
  const [promoted, setPromoted] = createSignal<StoreEntity[]>([]);
  const [facts, { refetch }] = createResource(() => [props.projectId, props.workspace] as const, async ([projectId]) => {
    try {
      const response = await window.polterware.core.canon.listFacts({ projectId });
      return { entities: asObjectArray(asRecord(response).facts).map((fact): StoreEntity => ({ kind: "fact", id: asString(fact.id), title: asString(fact.statement) })), error: "" };
    } catch (error) { return { entities: [], error: error instanceof Error ? error.message : String(error) }; }
  });
  const entities = createMemo<StoreEntity[]>(() => {
    const loaded: StoreEntity[] = [
      ...props.workspace.workCards.map((card): StoreEntity => ({ kind: "card", id: card.id, title: card.title, slug: card.slug })),
      ...props.workspace.decisions.map((decision): StoreEntity => ({ kind: "decision", id: decision.id, title: decision.title })),
      ...props.workspace.structure.nodes.map((node): StoreEntity => ({ kind: "node", id: node.id, title: node.title, level: node.level, componentKind: node.kind, tech: node.tech })),
      ...props.workspace.docs.map((item): StoreEntity => ({ kind: "evidence", id: item.id, title: item.title })),
      ...(facts()?.entities ?? []),
    ];
    return [...loaded, ...promoted().filter((entity) => !loaded.some((item) => item.kind === entity.kind && item.id === entity.id))];
  });
  async function reload() {
    try { await props.onReload(); setPromoted([]); setReloadError(""); }
    catch (error) { setReloadError(error instanceof Error ? error.message : String(error)); }
  }
  const port = { ...canvasPersistence, async promote(projectId: string, input: Parameters<NonNullable<typeof canvasPersistence.promote>>[1]) {
    const entity = await canvasPersistence.promote!(projectId, input);
    setPromoted((items) => [...items, entity]);
    // A refresh failure must not turn successful creation into a retryable promotion.
    void reload();
    return entity;
  } };
  return <div class="flex h-full min-h-0 flex-col">
    <Show when={facts.loading}><p role="status" class="px-4 text-xs text-[var(--color-text-muted)]">Loading project Facts…</p></Show>
    <Show when={facts()?.error}><p role="alert" class="px-4 text-sm text-[var(--color-danger)]">Could not load Facts: {facts()?.error} <Button size="sm" variant="ghost" onClick={() => void refetch()}>Retry</Button></p></Show>
    <Show when={reloadError()}><p role="alert" class="px-4 text-sm text-[var(--color-danger)]">Promotion saved. Could not refresh project data: {reloadError()} <Button size="sm" variant="ghost" onClick={() => void reload()}>Retry refresh</Button></p></Show>
    <CanvasView projectId={props.projectId} port={port} entities={entities()}
      openCanvasId={readRemembered<string | undefined>(`canvas.${props.projectId}`, undefined)}
      onOpenCanvasChange={(id) => writeRemembered(`canvas.${props.projectId}`, id)} />
  </div>;
}
