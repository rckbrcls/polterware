import { batch, createEffect, createMemo, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import { EntityDetailHost } from "@polterware/feature-shell";
import type { ArchitectureDocument, CaptureMode, NodeType } from "@polterware/frontend-canvas";
import {
  createEmptyDocument,
  docAddNode,
  newId,
  serializeDocument,
  updateNode as docUpdateNode,
} from "@polterware/frontend-canvas";
import { Boxes, Layers, Plus, Route, Workflow, Wrench01Icon } from "@polterware/frontend-design-system";
import {
  Button,
  FilterPopover,
  PageLoading,
  PageToolbar,
  SearchBar,
  Tabs,
  ToolbarIconButton,
  pushToast,
} from "@polterware/frontend-design-system";
import { ArchitectureCanvas } from "./architecture-canvas";
import type { SaveStatus } from "./architecture-canvas";
import { ArchitectureCanvasEmpty } from "./architecture-empty";
import { ArchitectureNodeDetail } from "./node-detail";
import { ARCH_CANVAS_FIXTURE, fixtureNodeDetail } from "./fixtures";
import { type ArchitectureViewDraft, type ArchViewCard } from "./extra-fixtures";
import { CreateNodeDialog, type ArchNodeDraft } from "./create-node-dialog";
import { roleLabel } from "./domain/place-config";
import { createResourceLinkPort } from "./domain/resource-link-port";
import type { LinkableResource } from "./domain/place-link";
import { DEFAULT_PROJECT_ENVIRONMENTS, environmentLabel } from "./domain/project-environments";
import { nodeStatusLabel } from "./domain/node-lifecycle";
import type { ArchitectureNodeView } from "./types";
import { loadDocumentFromLayoutBody, documentToLayoutBody } from "./document/load";
import { arrangeAtlas } from "./atlas-auto-layout";
import { absorbNestEdit, mergeAtlasSlots, nestChildren, placeNestRow, projectAtlasWorld, withAtlasUses, writeNestSlot } from "./atlas-map";
import { ATLAS_LEVEL_KEY, ATLAS_PARENT_KEY, childLevel, hierarchyGroups, nestDropIndex, subtreeIds } from "./nest-layout";
import { AtlasRecordDetail, type AtlasCanvasCard, type AtlasCanvasNode } from "./atlas-canvas";
import { ComponentsList } from "./components-list";
import { RelationsList } from "./relations-list";
import type { RelationDirection } from "./relations-model";
import { createAutosaveController } from "./persistence/autosave";
import { shouldApplyExternalLayout } from "./persistence/layout-reload";
import { getSessionSnapshot, setSessionSnapshot } from "./canvas/session-viewport";
import { assignLayer } from "./layers";
import { filterNodes, groupNodesByLayer } from "./map-view";
import {
  createDetailPanelSelector,
  detailPanelStore,
  type FixtureMode,
} from "@polterware/frontend-state";
import {
  canPersistArchitecture,
  orderArchitectureDetailNodes,
  resolveArchitectureDocument,
} from "./fixture-mode";
import { ARCHITECTURE_TAB_ITEMS, normalizeArchitectureTab } from "./tab";

const ARCH_TABS = ARCHITECTURE_TAB_ITEMS;

const SYSTEM_ID_DEFAULT = "sys-local";

const EDGE_FLOW_PREF_KEY = "architecture-edge-flow";

function readStringMetadata(
  metadata: Record<string, string | number | boolean> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return Object.prototype.toString.call(value) === "[object String]"
    ? String(value)
    : undefined;
}

function readEdgeFlowPref(): boolean {
  try {
    return localStorage.getItem(EDGE_FLOW_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

const FIXTURE_NODE_TYPES = {
  "n-gha": "ci_pipeline",
  "n-vercel": "web_application",
  "n-gw": "api_gateway",
  "n-auth": "service",
  "n-pay": "service",
  "n-worker": "worker",
  "n-pg": "database",
  "n-redis": "cache",
  "n-queue": "queue",
} satisfies Record<string, NodeType>;

const FIXTURE_PROVIDERS = {
  github: "GitHub",
  vercel: "Vercel",
  aws: "AWS",
} satisfies Record<string, string>;

export type ArchResource = {
  id: string;
  name: string;
  type?: string;
  source?: string;
  environmentLabel?: string;
  externalKey?: string;
  systemId?: string;
};

export type ArchSystem = { id: string; name: string };

export type DiscoveryCandidate = {
  externalKey: string;
  name: string;
  type?: string;
  source?: string;
};

/** Detail data projected into the global contextual panel. */
export type InspectorSnapshot = {
  knowledge: Array<{ id?: string; title: string; body?: string }>;
};

export type { ArchitectureNodeView } from "./types";
export { ArchitectureCanvas } from "./architecture-canvas";
export { AtlasCanvas } from "./atlas-canvas";
export type { AtlasCanvasCard, AtlasCanvasNode } from "./atlas-canvas";
export { ArchitectureNodeDetail } from "./node-detail";
export { ArchitectureViewDetail } from "./view-detail";
export { ARCH_CANVAS_FIXTURE, fixtureNodeDetail } from "./fixtures";
export type { ArchitectureViewDraft, ArchViewCard } from "./extra-fixtures";
export { VIEW_FIXTURES } from "./extra-fixtures";
export { assignLayer } from "./layers";
export { filterNodes, groupNodesByLayer } from "./map-view";
export {
  canPersistArchitecture,
  orderArchitectureDetailNodes,
  resolveArchitectureDocument,
} from "./fixture-mode";
export { ARCHITECTURE_TABS, normalizeArchitectureTab } from "./tab";
export { typeLabelFor } from "./type-label";

function mapDraftType(t: string, typeId?: string): NodeType {
  if (typeId) return typeId;
  const k = t.toLowerCase().replace(/\s+/g, "_");
  if (k.includes("database")) return "database";
  if (k.includes("cache")) return "cache";
  if (k.includes("queue")) return "queue";
  if (k.includes("worker")) return "worker";
  if (k.includes("web")) return "web_application";
  if (k.includes("api")) return "api";
  if (k.includes("service")) return "service";
  return "custom_resource";
}

function fixtureToDocument(): ArchitectureDocument {
  // Prefer migrate path from legacy fixture if available
  try {
    const body = JSON.stringify({
      nodes: ARCH_CANVAS_FIXTURE.nodes,
      edges: ARCH_CANVAS_FIXTURE.edges,
    });
    const fixtureNodes = new Map(ARCH_CANVAS_FIXTURE.nodes.map((node) => [node.id, node]));
    const fixtureDocument = loadDocumentFromLayoutBody(body, SYSTEM_ID_DEFAULT).doc;

    return {
      ...fixtureDocument,
      nodes: fixtureDocument.nodes.map((node) => {
        const fixtureNode = fixtureNodes.get(node.id);
        return {
          ...node,
          type: Object.entries(FIXTURE_NODE_TYPES).find(([id]) => id === node.id)?.[1] ?? node.type,
          provider: fixtureNode?.source
            ? Object.entries(FIXTURE_PROVIDERS).find(([id]) => id === fixtureNode.source)?.[1]
            : undefined,
          environmentIds: ["Production"],
          state: "observed",
        };
      }),
      relationships: fixtureDocument.relationships.map((relationship) => ({
        ...relationship,
        origin: relationship.evidence ? "discovered" : "inferred",
      })),
    };
  } catch {
    return createEmptyDocument({ systemId: SYSTEM_ID_DEFAULT });
  }
}

export function ArchitectureView(props: {
  systems?: ArchSystem[];
  resources?: ArchResource[];
  layoutBody?: string;
  layoutRevision?: number;
  candidates?: DiscoveryCandidate[];
  inspector?: InspectorSnapshot;
  error?: string;
  search?: string;
  tab?: string;
  selectedNodeId?: string | null;
  loading?: boolean;
  dataSource?: "fixture" | "empty";
  fixtureMode?: FixtureMode;
  createDialogOpen?: boolean;
  views?: ArchViewCard[];
  onSaveView?: (draft: ArchitectureViewDraft) => void | Promise<void>;
  onDeleteView?: (id: string) => void | Promise<void>;
  onSelect?: (nodeId: string | null) => void;
  onOpenNode?: (nodeId: string) => void;
  onSaveLayout?: (bodyJson: string, expectedRevision: number) => Promise<{ revision: number }> | { revision: number };
  onAssociate?: (c: DiscoveryCandidate) => void;
  onRefresh?: () => void;
  onTabChange?: (tab: string) => void;
  onCreateNode?: () => void;
  onCloseCreateNode?: () => void;
  onSubmitCreateNode?: (
    result: { ok: true; nodeId: string } | { ok: false; error: string },
  ) => void;
  /** When set, the map draws these nodes. The layout keeps only their slots and relationships. */
  atlasNodes?: readonly AtlasCanvasNode[];
  /** Work cards shown in the node detail. They are not canvas nodes. */
  cards?: readonly AtlasCanvasCard[];
  driftSlugs?: readonly string[];
  onReparentNode?: (nodeId: string, parentId: string) => Promise<void> | void;
  /** Adds or removes `targetId` in the source node's `uses:`. */
  onConnectNodes?: (sourceId: string, targetId: string) => Promise<void> | void;
  onDisconnectNodes?: (sourceId: string, targetId: string) => Promise<void> | void;
  onCreateNestedNode?: (parentId: string | null) => Promise<void> | void;
}) {
  const tab = () => normalizeArchitectureTab(props.tab);
  /** Provider resources synced by Integrations; components link to these. */
  const resourcePort = createMemo(() =>
    createResourceLinkPort(
      (props.resources ?? []).map((resource): LinkableResource => ({
        id: resource.id,
        name: resource.name,
        type: resource.type ?? "Resource",
        environmentId: "",
        environmentLabel: resource.environmentLabel,
        provider: resource.source,
        dataSource: "core",
      })),
    ),
  );

  const systemId = () => props.systems?.[0]?.id ?? SYSTEM_ID_DEFAULT;
  const fixtureMode = () => props.fixtureMode ?? "fallback";
  const [domainFocus, setDomainFocus] = createSignal<ReadonlySet<string>>(new Set());
  function toggleDomain(id: string, on: boolean) {
    setDomainFocus((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  const [parentOverrides, setParentOverrides] = createSignal<Record<string, string>>({});
  const [edgeFlow, setEdgeFlow] = createSignal(readEdgeFlowPref());
  const [relationsQuery, setRelationsQuery] = createSignal("");
  const [relationsDomains, setRelationsDomains] = createSignal<ReadonlySet<string>>(new Set());
  const [relationsDirection, setRelationsDirection] = createSignal<RelationDirection | null>(null);

  function setEdgeFlowPref(next: boolean) {
    setEdgeFlow(next);
    try {
      localStorage.setItem(EDGE_FLOW_PREF_KEY, next ? "1" : "0");
    } catch {
      // preference persistence is best-effort
    }
  }

  const [doc, setDoc] = createSignal<ArchitectureDocument>(
    createEmptyDocument({ systemId: systemId() }),
  );
  const [source, setSource] = createSignal<"fixture" | "empty">("empty");
  const [revision, setRevision] = createSignal(0);
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("clean");
  const [envId, setEnvId] = createSignal<string | "all">("all");
  // Defer canvas mount two frames after loading ends so setWorkspace / layout
  // parse do not compete with the same paint as ArchitectureCanvas DOM/SVG.
  const [canvasMountReady, setCanvasMountReady] = createSignal(!props.loading);
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);

  createEffect(() => {
    if (props.loading) {
      setCanvasMountReady(false);
      return;
    }
    let cancelled = false;
    let outerFrame = 0;
    let innerFrame = 0;
    outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (!cancelled) setCanvasMountReady(true);
      });
    });
    onCleanup(() => {
      cancelled = true;
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    });
  });

  /** Revision we last persisted successfully — used to ignore autosave echo reloads. */
  let lastLocalSaveRevision: number | null = null;
  /** Set before persist so workspace revision bumps cannot reload mid-save. */
  let suppressLayoutEcho = false;

  const autosave = createMemo(() => {
    if (!props.onSaveLayout || !canPersistArchitecture(fixtureMode())) return null;
    const ctrl = createAutosaveController({
      systemId: systemId(),
      port: {
        save: async (_sid, expectedRevision, bodyJson) => {
          suppressLayoutEcho = true;
          try {
            const result = await props.onSaveLayout?.(bodyJson, expectedRevision);
            if (!result) {
              throw new Error("Layout save did not return a revision.");
            }
            lastLocalSaveRevision = result.revision;
            return result;
          } catch (error) {
            suppressLayoutEcho = false;
            throw error;
          }
        },
      },
      onRevision: (rev) => {
        lastLocalSaveRevision = rev;
        setRevision(rev);
        // Workspace may already hold this revision; lastLocalSaveRevision covers the echo.
        suppressLayoutEcho = false;
      },
      onConflict: () => setSaveStatus("error"),
    });
    onCleanup(() => ctrl.dispose());
    return ctrl;
  });

  createEffect(() => {
    const ctrl = autosave();
    ctrl?.setStatusListener((s) => setSaveStatus(s));
  });

  const [loadKey, setLoadKey] = createSignal("");

  createEffect(() => {
    const sourceKey = `${systemId()}::${fixtureMode()}`;
    const remoteRevision = props.layoutRevision ?? 0;
    // Subscribe to body changes so external refreshes still re-enter this effect.
    void props.layoutBody;

    const apply = shouldApplyExternalLayout({
      sourceKey,
      previousSourceKey: loadKey(),
      remoteRevision,
      localRevision: untrack(() => revision()),
      lastLocalSaveRevision,
      suppressLayoutEcho,
    });
    if (!apply) {
      // Keep loadKey aligned with system/fixture even when we skip setDoc.
      if (loadKey() !== sourceKey) setLoadKey(sourceKey);
      return;
    }
    setLoadKey(sourceKey);
    suppressLayoutEcho = false;

    const systems = props.systems ?? [];
    const resources = props.resources ?? [];
    const { doc: loaded } = loadDocumentFromLayoutBody(
      props.layoutBody,
      systemId(),
      systems,
      resources,
    );

    const resolved = resolveArchitectureDocument({
      loaded,
      fixture: fixtureToDocument(),
      fixtureMode: fixtureMode(),
      dataSource: props.dataSource,
    });
    let nextDoc = resolved.document;
    const nextSource = resolved.dataSource;

    const session = getSessionSnapshot(systemId());
    if (session?.viewport) {
      nextDoc = { ...nextDoc, viewport: session.viewport };
    }
    if (session?.environmentId) setEnvId(session.environmentId);

    setDoc(props.atlasNodes ? mergeAtlasSlots(props.atlasNodes, nextDoc, untrack(parentOverrides)) : nextDoc);
    setSource(nextSource);
    setRevision(fixtureMode() === "force" ? 0 : remoteRevision);

    if (session?.selection?.nodeIds?.length) {
      const existing = session.selection.nodeIds.filter((id) =>
        nextDoc.nodes.some((n) => n.id === id),
      );
      if (existing[0]) props.onSelect?.(existing[0]);
    }
  });

  onCleanup(() => {
    const ctrl = autosave();
    void ctrl?.flush(
      () => documentToLayoutBody(doc()),
      () => revision(),
    );
  });

  function onDocumentChange(next: ArchitectureDocument, mode?: CaptureMode) {
    const stored = props.atlasNodes ? absorbNestEdit(untrack(doc), next) : next;
    setDoc(stored);
    next = stored;
    if (mode === "never") return;
    const ctrl = autosave();
    if (ctrl) {
      ctrl.schedule(
        () => serializeDocument(next),
        () => revision(),
      );
    }
  }

  createEffect(() => {
    const atlas = props.atlasNodes;
    if (!atlas) return;
    const overrides = parentOverrides();
    setDoc((prev) => mergeAtlasSlots(atlas, prev, overrides));
  });

  createEffect(() => {
    const atlas = props.atlasNodes;
    if (!atlas) return;
    setParentOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, parentId] of Object.entries(prev)) {
        const node = atlas.find((item) => item.id === id);
        if (!node || node.parentId === parentId) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  const worldDoc = createMemo(() => {
    const atlas = props.atlasNodes;
    return atlas ? withAtlasUses(projectAtlasWorld(doc()), atlas) : doc();
  });

  const shownIds = createMemo(() => {
    const atlas = props.atlasNodes;
    const focus = domainFocus();
    if (!atlas || focus.size === 0) return null;
    const parentOf = new Map(atlas.map((node) => [node.id, parentOverrides()[node.id] ?? node.parentId]));
    const ids = new Set<string>();
    for (const id of focus) for (const shown of subtreeIds(id, parentOf)) ids.add(shown);
    return ids;
  });

  function reparentNode(id: string, parentId: string, x: number, y: number) {
    const previous = untrack(doc);
    const previousOverrides = untrack(parentOverrides);
    const moved = previous.nodes.find((node) => node.id === id);
    const fromId = String(moved?.metadata?.[ATLAS_PARENT_KEY] ?? "");
    const isDomain = (nodeId: string) =>
      previous.nodes.find((node) => node.id === nodeId)?.metadata?.[ATLAS_LEVEL_KEY] === "domain";
    let next = writeNestSlot(previous, id, { x, y }, parentId);
    // Leaving a domain: the cards behind it close the gap, and the domain shrinks.
    if (isDomain(fromId)) next = placeNestRow(next, nestChildren(next, fromId).map((node) => node.id));
    // Entering a domain: the card takes the slot under the drop and the siblings make room.
    if (isDomain(parentId)) {
      const siblings = nestChildren(next, parentId, id);
      const order = siblings.map((node) => node.id);
      order.splice(nestDropIndex(siblings, x), 0, id);
      next = placeNestRow(next, order);
    }
    // Together, so the slot merge never sees the new parent with the old local slot.
    batch(() => {
      setDoc(next);
      setParentOverrides((current) => ({ ...current, [id]: parentId }));
    });
    // Save the drop point before the workspace refresh can bring back the old layout.
    const saved = autosave()?.flush(() => documentToLayoutBody(next), () => revision(), { force: true });
    // A failed layout save still lets the move land; autosave reports its own status.
    void Promise.resolve(saved?.catch(() => undefined))
      .then(() => props.onReparentNode?.(id, parentId))
      .catch(() => {
        batch(() => {
          setParentOverrides(previousOverrides);
          setDoc(previous);
        });
        autosave()?.schedule(() => serializeDocument(previous), () => revision());
        pushToast("Could not move the card.", "danger");
      });
  }

  const [arrangeRequest, setArrangeRequest] = createSignal<{ key: number; world: ArchitectureDocument } | null>(null);

  function arrange(options?: { silent?: boolean }) {
    const atlas = props.atlasNodes;
    if (!atlas) return;
    const next = arrangeAtlas(untrack(doc), untrack(worldDoc).relationships, untrack(shownIds));
    const world = withAtlasUses(projectAtlasWorld(next), atlas);
    setArrangeRequest((current) => ({ key: (current?.key ?? 0) + 1, world }));
    if (!options?.silent) pushToast("Map arranged. Undo to go back.", "success");
  }

  // A domain appearing or disappearing re-arranges what is left, and clearing the filter
  // arranges the whole map.
  createEffect(on(() => [...domainFocus()].sort().join(","), () => arrange({ silent: true }), { defer: true }));

  function createNested() {
    if (!props.atlasNodes) {
      props.onCreateNode?.();
      return;
    }
    const parent = props.atlasNodes.find((node) => node.id === props.selectedNodeId) ?? null;
    if (parent && childLevel(parent.level) === null) {
      pushToast("Components hold work cards. Select a system or domain to add a card inside.", "danger");
      return;
    }
    void props.onCreateNestedNode?.(parent?.id ?? null);
  }

  function nodeScopeId() {
    return "architecture:canvas";
  }

  function select(id: string | null) {
    if (tab() === "map" || tab() === "components") {
      if (id) {
        detailPanelStore.getState().activateTarget({
          scopeId: nodeScopeId(),
          entityId: id,
          entityKind: "arch-node",
        });
      } else {
        // Clear detail before route selection so the target→route sync
        // effect cannot revive the previous node on the same tick.
        detailPanelStore.getState().clearTarget(nodeScopeId());
      }
    }
    props.onSelect?.(id);
  }

  function openNode(id: string) {
    setSessionSnapshot(systemId(), {
      viewport: doc().viewport,
      selection: {
        nodeIds: id ? [id] : [],
        relationshipIds: [],
        boundaryIds: [],
      },
      environmentId: envId(),
    });
    detailPanelStore.getState().activateTarget({
      scopeId: nodeScopeId(),
      entityId: id,
      entityKind: "arch-node",
    });
    props.onOpenNode?.(id);
  }

  function openNodeOnCanvas(id: string) {
    props.onTabChange?.("map");
    setSessionSnapshot(systemId(), {
      viewport: doc().viewport,
      selection: {
        nodeIds: id ? [id] : [],
        relationshipIds: [],
        boundaryIds: [],
      },
      environmentId: envId(),
    });
    detailPanelStore.getState().activateTarget({
      scopeId: "architecture:canvas",
      entityId: id,
      entityKind: "arch-node",
    });
    props.onSelect?.(id);
    props.onOpenNode?.(id);
  }

  async function saveManual() {
    const ctrl = autosave();
    if (!ctrl) return;
    await ctrl.flush(
      () => documentToLayoutBody(doc()),
      () => revision(),
      { force: true },
    );
    if (ctrl.status() === "error") {
      pushToast(ctrl.lastError() ?? "Could not save canvas layout.", "danger");
      return;
    }
    pushToast("Canvas saved locally.", "success");
  }

  async function submitCreate(draft: ArchNodeDraft) {
    const type = mapDraftType(draft.type, draft.typeId);
    const envId = draft.environment
      ? draft.environment.toLowerCase().replace(/\s+/g, "-")
      : "production";
    const linked = Boolean(draft.linkedResourceId);
    const nodeId = newId("node");
    const next = docAddNode(doc(), {
      id: nodeId,
      name: draft.name.trim() || draft.type || "Untitled",
      type,
      subtype: draft.subtype,
      provider: draft.provider,
      x: 80 + doc().nodes.length * 24,
      y: 80 + doc().nodes.length * 16,
      description: draft.description || undefined,
      owner: draft.owner || undefined,
      environmentIds: [envId === "production" || envId === "staging" || envId === "development" || envId === "local" ? envId : "production"],
      resourceId: draft.linkedResourceId || null,
      origin: "manual",
      state: linked ? "linked" : "planned",
      linkStatus: linked ? "linked" : "unlinked",
    });
    onDocumentChange(next, "immediately");

    const ctrl = autosave();
    if (ctrl) {
      await ctrl.flush(
        () => serializeDocument(next),
        () => revision(),
      );
      if (ctrl.status() === "error") {
        props.onSubmitCreateNode?.({
          ok: false,
          error: ctrl.lastError() ?? "Could not save architecture layout.",
        });
        props.onCloseCreateNode?.();
        return;
      }
    }

    select(nodeId);
    props.onSubmitCreateNode?.({ ok: true, nodeId });
    props.onCloseCreateNode?.();
  }

  const isArchNodeTarget = createMemo(() => {
    const target = activeTarget();
    return target?.scopeId === "architecture:canvas" && target.entityKind === "arch-node";
  });

  const detailNode = createMemo((): ArchitectureNodeView | undefined => {
    const target = activeTarget();
    const id =
      target?.scopeId === "architecture:canvas" && target.entityKind === "arch-node"
        ? target.entityId
        : undefined;
    if (!id) return undefined;
    const n = doc().nodes.find((x) => x.id === id);
    if (!n && source() === "fixture") return fixtureNodeDetail(id);
    if (!n) return undefined;
    if (source() === "fixture") return fixtureNodeDetail(id, n.name);
    const linkedResource = n.resourceId ? resourcePort().getById(n.resourceId) : undefined;
    return {
      id: n.id,
      label: n.name,
      kind: n.type,
      layer: "applications",
      lifecycle: nodeStatusLabel(n.state),
      linkStatus: n.linkStatus ?? (n.resourceId ? "linked" : "unlinked"),
      status:
        n.state === "observed"
          ? "healthy"
          : n.state === "unreachable"
            ? "down"
            : n.state === "stale" || n.state === "drifted"
              ? "degraded"
              : "unknown",
      environment: environmentLabel(
        DEFAULT_PROJECT_ENVIRONMENTS,
        n.environmentIds?.[0],
      ),
      resourceId: n.resourceId ?? undefined,
      resourceName: linkedResource?.name,
      canLinkResource: !n.resourceId && (n.linkStatus ?? "unlinked") !== "linked",
      owner: n.owner,
      role: roleLabel(readStringMetadata(n.metadata, "role")),
      connected: doc()
        .relationships.filter((e) => e.sourceNodeId === n.id || e.targetNodeId === n.id)
        .map((e) => {
          const otherId = e.sourceNodeId === n.id ? e.targetNodeId : e.sourceNodeId;
          const other = doc().nodes.find((x) => x.id === otherId);
          return {
            nodeId: otherId,
            label: other?.name ?? otherId,
            relation: e.type,
            evidence: Boolean(e.evidence),
          };
        }),
      docs: (props.inspector?.knowledge ?? []).map((k) => ({
        id: k.id ?? k.title,
        title: k.title,
      })),
      notes: props.inspector?.knowledge?.[0]?.body ?? n.description,
      x: n.x,
      y: n.y,
      dataSource: "fixture",
    };
  });

  const detailTargets = createMemo(() => {
    const query = (props.search ?? "").trim().toLowerCase();
    const atlasNodes = props.atlasNodes
      ? doc().nodes.filter((node) => node.type !== "system")
      : doc().nodes;
    const baseNodes = query
      ? atlasNodes.filter(
          (node) =>
            node.name.toLowerCase().includes(query) ||
            node.type.includes(query) ||
            node.id.toLowerCase().includes(query) ||
            (node.tags ?? []).some((tag) => tag.toLowerCase().includes(query)),
        )
      : atlasNodes;
    const orderedNodes = orderArchitectureDetailNodes(
      baseNodes,
      source() === "fixture",
    );
    return orderedNodes.map((node) => ({
      scopeId: "architecture:canvas" as const,
      entityId: node.id,
      entityKind: "arch-node" as const,
    }));
  });

  let currentScope: string | undefined;

  createEffect(() => {
    // Map targets live in the canvas scope; the collection scope must match so pending targets
    // are consumed and unregistering releases the scope activation moved the panel to.
    const scope = "architecture:canvas";

    if (currentScope && currentScope !== scope) {
      detailPanelStore.getState().unregisterCollection(currentScope);
    }
    currentScope = scope;

    const targets = detailTargets();

    detailPanelStore.getState().registerCollection({
      scopeId: scope,
      status: props.loading ? "loading" : "ready",
      targets,
      selectFirst: false,
    });
  });

  onCleanup(() => {
    if (currentScope) {
      detailPanelStore.getState().unregisterCollection(currentScope);
    }
  });

  // Push detail-target changes into the route selection. Depend only on
  // activeTarget so clearing selectedNodeId cannot re-select from a stale target.
  createEffect(() => {
    const target = activeTarget();
    if (
      target?.scopeId !== "architecture:canvas" ||
      target.entityKind !== "arch-node"
    ) {
      return;
    }
    const entityId = target.entityId;
    if (untrack(() => props.selectedNodeId) === entityId) return;
    props.onSelect?.(entityId);
  });

  const canvasPanel = () => (
    <div class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <Show when={props.loading || !canvasMountReady()}>
        <PageLoading layout="canvas" label="Loading architecture…" />
      </Show>
      {/* Keep the fixture canvas usable when a local preview reports a soft error. */}
      <Show when={!props.loading && canvasMountReady()}>
        <Show when={props.error}>
          <div class="px-4 pt-2">
            <p class="mb-2 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[11px] text-[var(--color-text-muted)]">
              Preview note: {props.error} — the canvas still works locally.
            </p>
          </div>
        </Show>
        <div class="min-h-0 flex-1">
          <Show
            when={doc().nodes.length > 0}
            fallback={
              <ArchitectureCanvasEmpty
                onAddComponent={() => createNested()}
                onCreateFromTemplate={(template) => void submitCreate(template.draft)}
              />
            }
          >
            <ArchitectureCanvas
              document={worldDoc()}
              nested={Boolean(props.atlasNodes)}
              shownIds={shownIds()}
              arrangeRequest={arrangeRequest()}
              onNestReparent={props.atlasNodes ? reparentNode : undefined}
              onNestConnect={props.atlasNodes && props.onConnectNodes
                ? (sourceId, targetId) => {
                    void Promise.resolve(props.onConnectNodes?.(sourceId, targetId)).catch(() => {
                      pushToast("Could not connect the cards.", "danger");
                    });
                  }
                : undefined}
              onNestDisconnect={props.atlasNodes && props.onDisconnectNodes
                ? (sourceId, targetId) => {
                    void Promise.resolve(props.onDisconnectNodes?.(sourceId, targetId)).catch(() => {
                      pushToast("Could not remove the connection.", "danger");
                    });
                  }
                : undefined}
              systemId={systemId()}
              revision={revision()}
              selectedNodeId={props.selectedNodeId}
              search={props.search}
              environmentId={envId()}
              projectEnvironments={DEFAULT_PROJECT_ENVIRONMENTS}
              resourceLinkPort={resourcePort()}
              saveStatus={saveStatus()}
              onDocumentChange={onDocumentChange}
              onSelect={select}
              onOpenNode={openNode}
              onViewportChange={(vp) => setDoc((d) => ({ ...d, viewport: vp }))}
              onRequestSave={() => {
                void saveManual();
              }}
              edgeFlow={edgeFlow()}
            />
          </Show>
        </div>
        <Show when={props.atlasNodes && doc().nodes.length > 0}>
          <Button
            variant="texture"
            size="icon"
            class="!absolute bottom-3 left-3 z-10"
            aria-label="Auto layout"
            onClick={() => arrange()}
          >
            <Wrench01Icon size={14} />
          </Button>
        </Show>
      </Show>
    </div>
  );

  return (
    <EntityDetailHost mode="overlay">
      <>
        <div class="flex h-full min-h-0 flex-col">
          <PageToolbar.Root>
            <PageToolbar.Tabs>
              <Tabs
                items={ARCH_TABS}
                value={tab()}
                onChange={(id) => props.onTabChange?.(id)}
                aria-label="Architecture"
              />
            </PageToolbar.Tabs>
            <PageToolbar.Actions>
              <Show when={tab() === "map" && props.onSaveLayout && saveStatus() === "error"}>
                <Button variant="secondary" size="sm" onClick={() => saveManual()}>
                  Retry save
                </Button>
              </Show>
              <Show when={tab() === "relations"}>
                <SearchBar
                  placeholder="Search relations"
                  value={relationsQuery()}
                  onInput={setRelationsQuery}
                />
                <FilterPopover
                  ariaLabel="Filters"
                  title="Filters"
                  active={relationsDomains().size > 0 || relationsDirection() !== null}
                  onClear={() => {
                    setRelationsDomains(new Set<string>());
                    setRelationsDirection(null);
                  }}
                  groups={[
                    {
                      id: "domain",
                      label: "Domain",
                      leading: <Layers size={14} aria-hidden />,
                      options: hierarchyGroups(props.atlasNodes ?? []).map((node) => ({
                        id: node.id,
                        label: node.title,
                        leading: <Boxes size={14} aria-hidden />,
                        checked: relationsDomains().has(node.id),
                        onCheckedChange: (checked: boolean) =>
                          setRelationsDomains((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(node.id);
                            else next.delete(node.id);
                            return next;
                          }),
                      })),
                    },
                    {
                      id: "direction",
                      label: "Direction",
                      leading: <Workflow size={14} aria-hidden />,
                      options: (
                        [
                          ["uses", "Uses"],
                          ["usedBy", "Used by"],
                        ] as const
                      ).map(([id, label]) => ({
                        id,
                        label,
                        leading: <Route size={14} aria-hidden />,
                        checked: relationsDirection() === id,
                        onCheckedChange: (checked: boolean) => setRelationsDirection(checked ? id : null),
                      })),
                    },
                  ]}
                />
              </Show>
              <Show when={tab() === "map"}>
                <FilterPopover
                  ariaLabel="Filters"
                  title="Filters"
                  active={domainFocus().size > 0}
                  onClear={() => setDomainFocus(new Set())}
                  groups={[
                    ...(props.atlasNodes
                      ? [{
                          id: "domain",
                          label: "Domain",
                          leading: <Layers size={14} aria-hidden />,
                          options: hierarchyGroups(props.atlasNodes).map((node) => ({
                            id: node.id,
                            label: node.title,
                            leading: <Boxes size={14} aria-hidden />,
                            checked: domainFocus().has(node.id),
                            onCheckedChange: (checked: boolean) => toggleDomain(node.id, checked),
                          })),
                        }]
                      : []),
                    {
                      id: "flow",
                      label: "Flow",
                      leading: <Workflow size={14} aria-hidden />,
                      inline: true,
                      options: [{
                        id: "edge-flow",
                        label: "Flow",
                        leading: <Route size={14} aria-hidden />,
                        checked: edgeFlow(),
                        onCheckedChange: (checked: boolean) => setEdgeFlowPref(checked),
                      }],
                    },
                  ]}
                />
                <ToolbarIconButton
                  label="Add component"
                  onClick={() => createNested()}
                >
                  <Plus size={14} />
                </ToolbarIconButton>
              </Show>
            </PageToolbar.Actions>
          </PageToolbar.Root>
          <div class="relative flex min-h-0 flex-1 flex-col">
            <Show when={tab() === "map"}>
              {canvasPanel()}
            </Show>
            <Show when={tab() === "components"}>
              <ComponentsList
                nodes={props.atlasNodes ?? []}
                selectedId={props.selectedNodeId}
                onSelect={select}
              />
            </Show>
            <Show when={tab() === "relations"}>
              <RelationsList
                nodes={props.atlasNodes ?? []}
                selectedId={props.selectedNodeId}
                onSelect={select}
                filters={{
                  query: relationsQuery(),
                  domainIds: relationsDomains(),
                  direction: relationsDirection(),
                }}
              />
            </Show>
          </div>
        </div>
      </>
      <Show when={isArchNodeTarget() && props.atlasNodes}>
        <AtlasRecordDetail
          node={props.atlasNodes?.find((node) => node.id === (activeTarget()?.entityId ?? props.selectedNodeId))}
          cards={props.cards ?? []}
          historical={false}
        />
      </Show>
      <Show when={isArchNodeTarget() && !props.atlasNodes}>
        <ArchitectureNodeDetail
          node={detailNode()}
          loading={props.loading}
          error={props.error}
          notFound={!props.loading && !detailNode()}
          onOpenRelated={openNode}
          onOpenOnCanvas={openNodeOnCanvas}
          onLinkResource={(nodeId) => {
            const n = doc().nodes.find((x) => x.id === nodeId);
            if (!n) return;
            const envId = n.environmentIds?.[0] ?? "production";
            const candidates = resourcePort().listCandidates({
              environmentId: envId,
              componentType: n.type,
              typeFilterStrict: true,
            });
            const pick = candidates[0];
            if (!pick) {
              // Honest empty — no toast system here; leave unlinked
              return;
            }
            const next = docUpdateNode(doc(), nodeId, {
              resourceId: pick.id,
              linkStatus: "linked",
              state: "linked",
            });
            onDocumentChange(next, "immediately");
          }}
        />
      </Show>
      <CreateNodeDialog
        open={Boolean(props.createDialogOpen)}
        onClose={() => props.onCloseCreateNode?.()}
        onSubmit={(d) => submitCreate(d)}
        resourceLinkPort={resourcePort()}
      />
    </EntityDetailHost>
  );
}
