import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import type {
  ArchNode,
  ArchitectureDocument,
  CaptureMode,
  HistoryState,
  Point,
  Rect,
  RelationshipType,
  SelectionState,
  Viewport,
} from "@polterware/frontend-canvas";
import {
  addRelationship,
  canRedo,
  canUndo,
  commit,
  createHistory,
  deleteSelection,
  docAddNode,
  documentBounds,
  emptySelection,
  fitBounds,
  historyRedo,
  historyUndo,
  hitTest,
  isNodeConnectable,
  MAX_ZOOM,
  marqueeModeFromDrag,
  moveBoundaryWithMembers,
  moveRouteSegment,
  nearestSegmentIndex,
  pointsToRoundedSvgPath,
  removeRouteVertex,
  resolveRelationshipRoute,
  routeOrthogonalLine,
  panBy,
  pasteFragment,
  buildFragment,
  parseFragment,
  polylineMidpoint,
  screenToDocument,
  selectAll,
  selectClick,
  selectMarquee,
  serializeFragment,
  updateNode,
  updateRelationship,
  zoomAt,
  visibleDocumentRect,
  rectsIntersect,
} from "@polterware/frontend-canvas";
import {
  Check,
  ContextMenu,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  pushToast,
  spring,
  Tooltip,
} from "@polterware/frontend-design-system";
import { animate, motionValue } from "motion";
import { matchesShortcut } from "@polterware/frontend-state";
import { ArchitectureNodeCard } from "./architecture-node-card";
import { AtlasCardFrame, AtlasDropHighlight } from "./atlas-card-frame";
import {
  ATLAS_LEVEL_KEY,
  ATLAS_PARENT_KEY,
  NEST_CONTENT_H,
  NEST_CONTENT_W,
  NEST_CONTENT_X,
  NEST_CONTENT_Y,
  decideDrop,
  descendantIds,
  NEST_LEAF_H,
  NEST_LEAF_W,
  isNestLevel,
  nestDropIndex,
  nestRowFrameSize,
  nestRowOrder,
  nestSlotX,
  routeAroundCards,
  domainPillRect,
  type DropDecision,
  type NestHitNode,
  type NestLevel,
} from "../nest-layout";
import { isAtlasUsesEdge } from "../atlas-map";
import {
  HANDLE_SIDES,
  resolveHandleState,
  shouldShowConnectionHandles,
  type HandleSide,
} from "./connection-handles";
import { ArchitectureNodeIcon, nodeAccentColor, resolveNodeIconName } from "./architecture-node-icon";
import {
  relationshipMarkers,
  resolveRelationshipAppearance,
} from "../domain/relationship-appearance";
import { RelationshipTypeIcon } from "../domain/relationship-type-icon";
import { canConnect } from "../domain/connection-rules";
import { suggestRelationshipTypes } from "../domain/suggestions";
import {
  defaultNodeSize,
  defaultPorts,
  getComponentType,
  labelForRelType,
  listCatalogTypes,
  listCreatableRelationshipTypes,
  type ComponentTypeDefinition,
} from "../domain/registry";
import {
  environmentIdsFromConfig,
  lifecycleFromPlaceConfig,
  metadataFromPlaceConfig,
  type PlaceConfig,
} from "../domain/place-config";
import {
  DEFAULT_PROJECT_ENVIRONMENTS,
  normalizeEnvironmentId,
  type ProjectEnvironment,
} from "../domain/project-environments";
import {
  createResourceLinkPort,
  type ResourceLinkPort,
} from "../domain/resource-link-port";
import { suggestPlaceFromResource, type LinkableResource } from "../domain/place-link";
import { setSessionSnapshot } from "./session-viewport";
import { createLocalStorageTypePrefs } from "./type-prefs-local";
import { AddToArchitectureDialog } from "./add-to-architecture-dialog";
import { ConfigureComponentDialog } from "./configure-component-dialog";
import { nextEdgeFlowDistance } from "./edge-flow-distance";
import type { ToolId } from "./tools";
import "./architecture-canvas-host.css";

export type { ToolId } from "./tools";

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

/** Discrete zoom step for keyboard / toolbar buttons (~25% per click). */
const ZOOM_STEP = 1.25;
/**
 * Wheel / pinch zoom gain for exp(-deltaY * gain).
 * Higher = snappier. Pixel-mode trackpad deltas are small; mouse notches ~100.
 */
const WHEEL_ZOOM_GAIN = 0.004;
/** Cap per wheel event — allow larger jumps so zoom does not feel sticky. */
const WHEEL_ZOOM_MAX_STEP = 1.35;
const GRID_SPACING = 12;
const GRID_OVERSCAN = GRID_SPACING * MAX_ZOOM;
const MARQUEE_ACTIVATION_DISTANCE = 3;

/** Deterministic phase (0..1) from the relationship id — desyncs edge flow dots. */
function edgeFlowPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Edge flow travel speed in document px/s — same speed for every edge regardless of length. */
const EDGE_FLOW_SPEED = 35;

export function ArchitectureCanvasHost(props: {
  document: ArchitectureDocument;
  systemId: string;
  revision: number;
  selectedNodeId?: string | null;
  search?: string;
  environmentId?: string | "all";
  /** Project environments for component placement (fixture default when omitted). */
  projectEnvironments?: readonly ProjectEnvironment[];
  resourceLinkPort?: ResourceLinkPort;
  saveStatus?: SaveStatus;
  onDocumentChange: (doc: ArchitectureDocument, mode?: CaptureMode) => void;
  onSelect: (id: string | null) => void;
  onOpenNode: (id: string) => void;
  onViewportChange?: (vp: Viewport) => void;
  onRequestSave?: () => void;
  onRevisionLocal?: (body: string) => void;
  /** Opens Resources create when operator picks Add resource in the catalog. */
  /** Operator toggle for the edge flow animation (toolbar). Defaults to on. */
  edgeFlow?: boolean;
  /** Atlas cards: parent metadata is the group, and drops can reparent. */
  nested?: boolean;
  /** Null shows every card. A set fades everyone else and keeps them mounted. */
  shownIds?: ReadonlySet<string> | null;
  /** Changes when the focused group or view changes, so the camera can spring to it. */
  focusKey?: string;
  onNestReparent?: (id: string, parentId: string, x: number, y: number) => void;
  /** Atlas edges are the model's `uses:`: drawing one writes it, deleting one clears it. */
  onNestConnect?: (sourceId: string, targetId: string) => void;
  onNestDisconnect?: (sourceId: string, targetId: string) => void;
  /** A new key applies `world` as one undoable edit (Auto layout), then fits the map. */
  arrangeRequest?: { key: number; world: ArchitectureDocument } | null;
}) {
  const projectEnvironments = () =>
    props.projectEnvironments && props.projectEnvironments.length > 0
      ? props.projectEnvironments
      : DEFAULT_PROJECT_ENVIRONMENTS;
  const resourceLinkPort = () => props.resourceLinkPort ?? createResourceLinkPort([]);
  const [vp, setVp] = createSignal<Viewport>(props.document.viewport ?? { x: 40, y: 40, zoom: 1 });
  const [sel, setSel] = createSignal<SelectionState>(emptySelection());
  const [tool, setTool] = createSignal<ToolId>("select");
  const [spaceHand, setSpaceHand] = createSignal(false);
  const [history, setHistory] = createSignal<HistoryState>(createHistory());
  const [marquee, setMarquee] = createSignal<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [connectFrom, setConnectFrom] = createSignal<{ nodeId: string } | null>(null);
  const [connectPt, setConnectPt] = createSignal<Point | null>(null);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    kind: "empty" | "node" | "relationship" | "multi";
    id?: string;
  } | null>(null);
  const [pasteCount, setPasteCount] = createSignal(0);
  const [internalClipboard, setInternalClipboard] = createSignal<string | null>(null);
  const [viewSize, setViewSize] = createSignal({ w: 800, h: 600 });
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [configureDef, setConfigureDef] = createSignal<ComponentTypeDefinition | null>(null);
  const [configureInitial, setConfigureInitial] = createSignal<Partial<PlaceConfig> | null>(null);
  const [placeOrigin, setPlaceOrigin] = createSignal<Point | null>(null);
  /** After configuration when origin is null: click canvas to place. */
  const [pendingPlace, setPendingPlace] = createSignal<{
    def: ComponentTypeDefinition;
    config: PlaceConfig;
  } | null>(null);
  /**
   * Controlled open state for the midpoint relationship-type menu.
   * Set after a successful connect so the edge already exists and the operator
   * can confirm/change the recommended type from the hover control.
   */
  const [relTypeMenuId, setRelTypeMenuId] = createSignal<string | null>(null);
  const [connectQuickType, setConnectQuickType] = createSignal<RelationshipType | null>(null);
  const [highlightIds, setHighlightIds] = createSignal<Set<string> | null>(null);
  const [hoveredId, setHoveredId] = createSignal<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);
  /** Exact port under the cursor (hit-test); drives per-handle focus animation. */
  const [hoveredPort, setHoveredPort] = createSignal<{
    nodeId: string;
    portId: string;
  } | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = createSignal(false);
  const [panning, setPanning] = createSignal(false);
  const typePrefs = createLocalStorageTypePrefs();
  const [nodeDragOffset, setNodeDragOffset] = createSignal<{ dx: number; dy: number } | null>(null);
  const [draggedNodeIds, setDraggedNodeIds] = createSignal<ReadonlySet<string>>(new Set());
  const [dropTargetId, setDropTargetId] = createSignal<string | null>(null);
  /**
   * While a card is dragged: where the domain cards slide to (fixed row slots),
   * the size the domains take, and the slot the dragged card will land in.
   */
  const [nestPreview, setNestPreview] = createSignal<{
    key: string;
    cards: ReadonlyMap<string, Point>;
    frames: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>;
    slot: { x: number; y: number; width: number; height: number } | null;
  } | null>(null);
  const activePreview = () => (draggedNodeIds().size ? nestPreview() : null);
  const previewCard = (id: string) => activePreview()?.cards.get(id);
  const previewFrame = (id: string) => activePreview()?.frames.get(id);

  function planNestPreview(dragged: NestHitNode, decision: DropDecision, topLeft: Point) {
    if (dragged.level !== "component") {
      setNestPreview(null);
      return;
    }
    const nodeOf = (id: string) => props.document.nodes.find((node) => node.id === id);
    const isDomain = (id: string) => nestLevelOf(nodeOf(id)) === "domain";
    const rowOf = (domainId: string) =>
      nestRowOrder(props.document.nodes.filter((node) => node.id !== dragged.id && nestParentId(node) === domainId));
    const into = decision.kind === "reparent" ? decision.parentId : decision.kind === "move" ? dragged.parentId : null;
    const cards = new Map<string, Point>();
    const frames = new Map<string, { x: number; y: number; width: number; height: number }>();
    const keys: string[] = [];
    const lay = (domainId: string, order: readonly string[]) => {
      const domain = nodeOf(domainId);
      const content = nestContent(domain);
      if (!domain || !content) return;
      order.forEach((id, index) => cards.set(id, { x: content.x + nestSlotX(index), y: content.y }));
      frames.set(domainId, { x: domain.x, y: domain.y, ...nestRowFrameSize(order.length) });
      keys.push(`${domainId}:${order.join(",")}`);
    };
    // The domain it leaves closes the gap.
    if (isDomain(dragged.parentId) && into !== dragged.parentId) {
      lay(dragged.parentId, rowOf(dragged.parentId).map((node) => node.id));
    }
    let slot: { x: number; y: number; width: number; height: number } | null = null;
    // The domain it lands in makes room at the slot under the drop.
    const content = into && isDomain(into) ? nestContent(nodeOf(into)) : null;
    if (into && content) {
      const siblings = rowOf(into);
      const order = siblings.map((node) => node.id);
      order.splice(
        nestDropIndex(siblings.map((node) => ({ x: node.x - content.x })), topLeft.x - content.x),
        0,
        dragged.id,
      );
      lay(into, order);
      const at = cards.get(dragged.id);
      cards.delete(dragged.id);
      if (at) slot = { ...at, width: NEST_LEAF_W, height: NEST_LEAF_H };
    }
    const key = keys.join("|");
    if (!key) {
      setNestPreview(null);
      return;
    }
    if (untrack(nestPreview)?.key === key) return;
    setNestPreview({ key, cards, frames, slot });
  }

  /** Drop inside the card's own domain: it takes its slot and the row keeps fixed places. */
  function commitNestReorder(id: string): boolean {
    const plan = nestPreview();
    if (!plan?.slot) return false;
    const slot = plan.slot;
    batch(() => {
      applyDoc(
        {
          ...props.document,
          nodes: props.document.nodes.map((node) => {
            if (node.id === id) return { ...node, x: slot.x, y: slot.y };
            const at = plan.cards.get(node.id);
            return at ? { ...node, x: at.x, y: at.y } : node;
          }),
        },
        "immediately",
      );
      setNodeDragOffset(null);
      setDraggedNodeIds(new Set<string>());
      setDropTargetId(null);
    });
    nextDragOffset = { dx: 0, dy: 0 };
    return true;
  }
  const [enteringNodes, setEnteringNodes] = createSignal<Set<string>>(new Set());

  let rootEl: HTMLDivElement | undefined;
  let worldEl: HTMLDivElement | undefined;

  const effectiveTool = () => (spaceHand() ? "hand" : tool());
  const gridSize = () => GRID_SPACING * vp().zoom;
  const gridPhase = (value: number) => {
    const size = gridSize();
    return ((value % size) + size) % size;
  };

  function markNodesEntering(ids: readonly string[]) {
    if (prefersReducedMotion() || ids.length === 0) return;
    setEnteringNodes((current) => new Set([...current, ...ids]));
  }

  function completeNodeEntry(id: string) {
    setEnteringNodes((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  const edgeFlowOn = () =>
    props.edgeFlow !== false && !prefersReducedMotion() && vp().zoom >= 0.45;

  const nestParentId = (node: ArchNode | undefined) =>
    String(node?.metadata?.[ATLAS_PARENT_KEY] ?? "");

  const nestLevelOf = (node: ArchNode | undefined): NestLevel | null => {
    const level = String(node?.metadata?.[ATLAS_LEVEL_KEY] ?? "");
    return isNestLevel(level) ? level : null;
  };

  const nestContent = (node: ArchNode | undefined) => {
    const meta = node?.metadata;
    const x = meta?.[NEST_CONTENT_X];
    const y = meta?.[NEST_CONTENT_Y];
    const width = meta?.[NEST_CONTENT_W];
    const height = meta?.[NEST_CONTENT_H];
    if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") {
      return null;
    }
    return { x, y, width, height };
  };

  const nestHits = (): NestHitNode[] =>
    props.document.nodes.flatMap((node) => {
      const level = nestLevelOf(node);
      const content = nestContent(node);
      if (!level || !content) return [];
      return [{
        id: node.id,
        parentId: nestParentId(node),
        level,
        depth: node.zIndex,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        content,
      }];
    });

  /** The system above an Atlas card: where a component lands when it leaves its domain. */
  function nestRootOf(id: string): string | undefined {
    const seen = new Set<string>();
    let current = nestParentId(props.document.nodes.find((node) => node.id === id));
    while (current && !seen.has(current)) {
      seen.add(current);
      const node = props.document.nodes.find((candidate) => candidate.id === current);
      if (!node) return undefined;
      if (nestLevelOf(node) === "system") return node.id;
      current = nestParentId(node);
    }
    return undefined;
  }

  function routeNodes(a: ArchNode, b: ArchNode, manual?: Point[], edgeId?: string) {
    if (props.nested && !manual?.length) {
      // Go around the other cards so an edge never reads as leaving a card it does not touch.
      const obstacles: Rect[] = props.document.nodes.flatMap((node) => {
        if (node.id === a.id || node.id === b.id) return [];
        if (nestLevelOf(node) !== "component" || concealed(node.id)) return [];
        const placed = effectiveNode(node);
        return placed ? [placed] : [];
      });
      // Domain title pills are obstacles too: an edge never runs through a label.
      for (const node of props.document.nodes) {
        if (nestLevelOf(node) !== "domain" || concealed(node.id)) continue;
        const placed = effectiveNode(node);
        if (placed) obstacles.push(domainPillRect(placed, node.name));
      }
      const parentA = nestParentId(a);
      const parent = parentA && parentA === nestParentId(b)
        ? props.document.nodes.find((node) => node.id === parentA)
        : undefined;
      const frame = parent && nestLevelOf(parent) === "domain" ? effectiveNode(parent) : undefined;
      // Between domains, detours run outside the frames instead of along their borders.
      const frames = frame
        ? []
        : props.document.nodes.flatMap((node) => {
            if (nestLevelOf(node) !== "domain" || concealed(node.id)) return [];
            const placed = effectiveNode(node);
            return placed ? [placed] : [];
          });
      const index = edgeId ? props.document.relationships.findIndex((edge) => edge.id === edgeId) : -1;
      return routeAroundCards(a, b, obstacles, frame, frames, index < 0 ? 0 : (index % 4) * 10);
    }
    return resolveRelationshipRoute(a, b, manual);
  }

  function concealed(id: string) {
    const shown = props.shownIds;
    return Boolean(shown && !shown.has(id));
  }

  function hitDocument() {
    const shown = props.shownIds;
    return {
      ...props.document,
      nodes: props.document.nodes.filter((node) => {
        if (props.nested && nestLevelOf(node) === "system") return false;
        if (shown && !shown.has(node.id)) return false;
        return true;
      }),
    };
  }

  function commitNodeDrag(off: { dx: number; dy: number }) {
    const positions = new Map<string, { x: number; y: number }>();
    for (const [id, origin] of nodeOrigins) {
      positions.set(id, { x: origin.x + off.dx, y: origin.y + off.dy });
    }
    // One update: frames see the new place and the released drag together, so nothing springs back.
    batch(() => {
      applyDoc(
        {
          ...props.document,
          nodes: props.document.nodes.map((node) => {
            const position = positions.get(node.id);
            return position && !node.locked ? { ...node, x: position.x, y: position.y } : node;
          }),
        },
        "immediately",
      );
      setNodeDragOffset(null);
      setDraggedNodeIds(new Set<string>());
      setDropTargetId(null);
    });
    nextDragOffset = { dx: 0, dy: 0 };
  }

  function springDragHome() {
    const from = nextDragOffset;
    if (prefersReducedMotion() || (from.dx === 0 && from.dy === 0)) {
      setNodeDragOffset(null);
      setDraggedNodeIds(new Set<string>());
      setDropTargetId(null);
      return;
    }
    const x = motionValue(from.dx);
    const y = motionValue(from.dy);
    const paint = () => setNodeDragOffset({ dx: x.get(), dy: y.get() });
    const stopX = x.on("change", paint);
    const stopY = y.on("change", paint);
    const done = () => {
      stopX();
      stopY();
      x.stop();
      y.stop();
      setNodeDragOffset(null);
      setDraggedNodeIds(new Set<string>());
      setDropTargetId(null);
    };
    void Promise.all([
      animate(x, 0, spring.moderate).finished,
      animate(y, 0, spring.moderate).finished,
    ]).then(done, done);
  }

  /**
   * Edge flow dots are driven by one shared rAF loop storing absolute distance
   * (px) along each route. When the path length morphs (node drag), distance is
   * rescaled by fraction so dots do not teleport. Relationship scopes are keyed
   * by id so document identity churn does not remount dots or wipe phases.
   */
  const flowPhases = new Map<string, number>();
  const flowDots = new Map<
    string,
    { el: HTMLElement; length: () => number; lastLength: number }
  >();
  let flowRaf = 0;
  let flowLast = 0;

  let tweenRaf = 0;
  let tweenStart = 0;
  let tweenStartVp: Viewport | null = null;
  let tweenTargetVp: Viewport | null = null;

  // Wheel zoom eases toward an accumulated target so notches and pinch feel fluid, not stepped.
  let zoomRaf = 0;
  let zoomTarget: number | null = null;
  let zoomAnchor = { x: 0, y: 0 };

  function stopZoomEase() {
    if (zoomRaf) cancelAnimationFrame(zoomRaf);
    zoomRaf = 0;
    zoomTarget = null;
  }

  function zoomTick() {
    zoomRaf = 0;
    if (zoomTarget === null) return;
    const current = vp().zoom;
    const gap = zoomTarget / current;
    if (Math.abs(Math.log(gap)) < 0.002) {
      setVp((v) => zoomAt(v, zoomAnchor, zoomTarget!));
      zoomTarget = null;
      return;
    }
    setVp((v) => zoomAt(v, zoomAnchor, v.zoom * Math.pow(gap, 0.35)));
    zoomRaf = requestAnimationFrame(zoomTick);
  }

  function cancelTween() {
    stopZoomEase();
    if (tweenRaf) {
      cancelAnimationFrame(tweenRaf);
      tweenRaf = 0;
    }
    tweenStartVp = null;
    tweenTargetVp = null;
  }

  function tweenTo(target: Viewport) {
    if (prefersReducedMotion()) {
      cancelTween();
      setVp(target);
      return;
    }
    tweenStartVp = vp();
    tweenTargetVp = target;
    tweenStart = performance.now();
    if (!tweenRaf) {
      tweenRaf = requestAnimationFrame(tweenTick);
    }
  }

  function tweenTick(time: number) {
    if (!tweenStartVp || !tweenTargetVp) {
      tweenRaf = 0;
      return;
    }
    const elapsed = time - tweenStart;
    const progress = Math.min(Math.max(elapsed / 200, 0), 1);

    if (progress >= 1) {
      setVp(tweenTargetVp);
      tweenStartVp = null;
      tweenTargetVp = null;
      tweenRaf = 0;
      return;
    }

    let t = progress;
    for (let i = 0; i < 8; i++) {
      const curX = 3 * (1 - t) * (1 - t) * t * 0.77 + 3 * (1 - t) * t * t * 0.175 + t * t * t - progress;
      if (Math.abs(curX) < 1e-5) break;
      const derX = 3 * (1 - t) * (1 - t) * 0.77 + 6 * (1 - t) * t * (0.175 - 0.77) + 3 * t * t * (1 - 0.175);
      t = Math.min(1, Math.max(0, t - curX / (derX || 1e-5)));
    }
    const eased = 3 * (1 - t) * t * t + t * t * t;

    setVp({
      x: tweenStartVp.x + (tweenTargetVp.x - tweenStartVp.x) * eased,
      y: tweenStartVp.y + (tweenTargetVp.y - tweenStartVp.y) * eased,
      zoom: tweenStartVp.zoom + (tweenTargetVp.zoom - tweenStartVp.zoom) * eased,
    });
    tweenRaf = requestAnimationFrame(tweenTick);
  }

  const checkFlowLoop = () => {
    const shouldRun = globalThis.document != null
      && edgeFlowOn()
      && globalThis.document.visibilityState === "visible"
      && flowDots.size > 0;
    if (shouldRun && !flowRaf) {
      flowLast = performance.now();
      flowRaf = requestAnimationFrame(flowTick);
    } else if (!shouldRun && flowRaf) {
      cancelAnimationFrame(flowRaf);
      flowRaf = 0;
    }
  };

  const flowTick = (t: number) => {
    if (!edgeFlowOn() || document.visibilityState !== "visible" || flowDots.size === 0) {
      flowRaf = 0;
      return;
    }
    const dt = Math.min((t - flowLast) / 1000, 0.1);
    flowLast = t;
    for (const [id, d] of flowDots) {
      if (!d.el.isConnected) {
        flowDots.delete(id);
        continue;
      }
      const len = d.length();
      if (len <= 0) continue;

      const currentDist = flowPhases.get(id) ?? edgeFlowPhase(id) * len;
      const nextDist = nextEdgeFlowDistance(
        currentDist,
        d.lastLength,
        len,
        EDGE_FLOW_SPEED * dt,
      );
      d.lastLength = len;
      flowPhases.set(id, nextDist);

      d.el.style.setProperty("offset-distance", `${nextDist}px`);
    }
    if (flowDots.size === 0) {
      flowRaf = 0;
      return;
    }
    flowRaf = requestAnimationFrame(flowTick);
  };

  createEffect(() => {
    edgeFlowOn();
    checkFlowLoop();
  });

  // Drop phases for relationships that no longer exist — do not wipe on For remount.
  createEffect(() => {
    const ids = new Set(props.document.relationships.map((r) => r.id));
    for (const id of [...flowPhases.keys()]) {
      if (!ids.has(id)) flowPhases.delete(id);
    }
  });

  const relationshipIds = createMemo(() =>
    props.document.relationships.map((r) => r.id),
  );
  const relationshipById = (id: string) =>
    props.document.relationships.find((r) => r.id === id);

  onMount(() => {
    const onVisibilityChange = () => checkFlowLoop();
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (flowRaf) cancelAnimationFrame(flowRaf);
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      if (nodeDragRaf) cancelAnimationFrame(nodeDragRaf);
      if (rightPanReleaseRaf) cancelAnimationFrame(rightPanReleaseRaf);
    });
  });

  createEffect(() => {
    const v = props.document.viewport;
    if (v && (v.x !== vp().x || v.y !== vp().y || v.zoom !== vp().zoom)) {
      // only sync when external load
    }
  });

  let nestSeenIds = new Set<string>();
  let nestSeenReady = false;
  createEffect(() => {
    if (!props.nested) return;
    const ids = props.document.nodes.map((node) => node.id);
    if (!nestSeenReady) {
      nestSeenIds = new Set(ids);
      nestSeenReady = true;
      return;
    }
    const fresh = ids.filter((id) => !nestSeenIds.has(id));
    nestSeenIds = new Set(ids);
    markNodesEntering(fresh);
  });

  createEffect(on(() => props.focusKey ?? "", (key) => {
    if (!props.nested || !key) return;
    const shown = untrack(() => props.shownIds);
    if (!shown || shown.size === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of untrack(() => props.document.nodes)) {
      if (!shown.has(node.id)) continue;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    if (!Number.isFinite(minX)) return;
    const current = untrack(() => vp());
    const size = untrack(() => viewSize());
    const target = fitBounds(current, { minX, minY, maxX, maxY }, size.w, size.h);
    if (prefersReducedMotion()) {
      setVp(target);
      props.onViewportChange?.(target);
      return;
    }
    const x = motionValue(current.x);
    const y = motionValue(current.y);
    const zoom = motionValue(current.zoom);
    const paint = () => setVp({ ...untrack(vp), x: x.get(), y: y.get(), zoom: zoom.get() });
    const stops = [x, y, zoom].map((value) => value.on("change", paint));
    void Promise.all([
      animate(x, target.x, spring.moderate).finished,
      animate(y, target.y, spring.moderate).finished,
      animate(zoom, target.zoom, spring.moderate).finished,
    ]).then(() => {
      for (const stop of stops) stop();
      x.stop();
      y.stop();
      zoom.stop();
      setVp(target);
      props.onViewportChange?.(target);
    });
  }, { defer: true }));

  createEffect(() => {
    if (!prefersReducedMotion()) return;
    if (tweenTargetVp) {
      const target = tweenTargetVp;
      cancelTween();
      setVp(target);
    }
    if (enteringNodes().size > 0) {
      setEnteringNodes(new Set<string>());
    }
  });

  // Sync external primary selection → local rings. untrack(sel) so clearing
  // local selection while selectedNodeId is still stale cannot re-select.
  createEffect(() => {
    const id = props.selectedNodeId;
    const current = untrack(() => sel());
    if (id) {
      if (!current.nodeIds.includes(id)) {
        setSel({ nodeIds: [id], relationshipIds: [], boundaryIds: [] });
      }
      return;
    }
    if (
      current.nodeIds.length > 0
      || current.relationshipIds.length > 0
      || current.boundaryIds.length > 0
    ) {
      setSel(emptySelection());
    }
  });

  onMount(() => {
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setViewSize({ w: cr.width, h: cr.height });
    });
    if (rootEl) ro.observe(rootEl);
    onCleanup(() => ro.disconnect());

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(motionQuery.matches);
    const onMotionPreference = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    motionQuery.addEventListener("change", onMotionPreference);
    onCleanup(() =>
      motionQuery.removeEventListener("change", onMotionPreference),
    );

    let tempHandCode: string | null = null;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      // Catalog / dialog Escape must work even when search input is focused.
      if (e.key === "Escape" && catalogOpen()) {
        e.preventDefault();
        e.stopPropagation();
        setCatalogOpen(false);
        return;
      }
      if (e.key === "Escape" && configureDef()) {
        e.preventDefault();
        e.stopPropagation();
        setConfigureDef(null);
        setConfigureInitial(null);
        return;
      }
      if (e.key === "Escape" && pendingPlace()) {
        e.preventDefault();
        e.stopPropagation();
        setPendingPlace(null);
        pushToast("Placement cancelled");
        return;
      }

      if (matchesShortcut("architecture.save", e)) {
        e.preventDefault();
        props.onRequestSave?.();
        return;
      }

      const editable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.tagName === "SELECT");
      const interactive = target?.closest("button, a, [role='menu'], [role='menuitem']");
      if (editable || interactive) return;

      if (matchesShortcut("architecture.temp_hand", e)) {
        if (!e.repeat) {
          tempHandCode = e.code;
          setSpaceHand(true);
        }
        e.preventDefault();
        return;
      }

      if (e.key === "Escape") {
        // Layered escape: popover → edit → connect → menu → tool → selection
        if (relTypeMenuId()) {
          setRelTypeMenuId(null);
          return;
        }
        if (editingId()) {
          setEditingId(null);
          return;
        }
        if (connectFrom()) {
          setConnectFrom(null);
          setConnectPt(null);
          setTool("select");
          return;
        }
        if (contextMenu()) {
          setContextMenu(null);
          return;
        }
        if (highlightIds()) {
          setHighlightIds(null);
          return;
        }
        if (connectQuickType() || tool() !== "select") {
          setConnectQuickType(null);
          setTool("select");
          return;
        }
        setSel(emptySelection());
        props.onSelect(null);
        return;
      }

      if (matchesShortcut("architecture.undo", e)) {
        e.preventDefault();
        doUndo();
        return;
      }
      if (matchesShortcut("architecture.redo", e)) {
        e.preventDefault();
        doRedo();
        return;
      }
      if (matchesShortcut("architecture.select_all", e)) {
        e.preventDefault();
        setSel(selectAll(props.document));
        return;
      }
      if (matchesShortcut("architecture.copy", e)) {
        e.preventDefault();
        doCopy();
        return;
      }
      if (matchesShortcut("architecture.cut", e)) {
        e.preventDefault();
        doCopy();
        doDelete();
        return;
      }
      if (matchesShortcut("architecture.paste", e)) {
        e.preventDefault();
        void doPaste();
        return;
      }
      if (matchesShortcut("architecture.duplicate", e)) {
        e.preventDefault();
        doCopy();
        void doPaste();
        return;
      }
      if (matchesShortcut("architecture.delete", e)) {
        e.preventDefault();
        doDelete();
        return;
      }
      if (matchesShortcut("architecture.open_node", e) && sel().nodeIds[0]) {
        e.preventDefault();
        snapshotSession();
        const id = sel().nodeIds[0];
        if (id) props.onOpenNode(id);
        return;
      }
      if (matchesShortcut("architecture.tool_select", e)) {
        setTool("select");
        return;
      }
      if (matchesShortcut("architecture.tool_hand", e)) {
        setTool("hand");
        return;
      }
      if (matchesShortcut("architecture.tool_connect", e)) {
        const id = sel().nodeIds[0];
        const node = props.document.nodes.find((candidate) => candidate.id === id);
        if (node && sel().nodeIds.length === 1 && isNodeConnectable(node)) {
          setTool("connect");
          setConnectFrom({ nodeId: node.id });
        }
        return;
      }
      if (matchesShortcut("architecture.add_node", e)) {
        e.preventDefault();
        openCatalog(null);
        return;
      }
      if (matchesShortcut("architecture.zoom_reset", e)) {
        cancelTween();
        setVp((v) => ({ ...v, zoom: 1 }));
        return;
      }
      if (matchesShortcut("architecture.zoom_in", e)) {
        cancelTween();
        setVp((v) =>
          zoomAt(v, { x: viewSize().w / 2, y: viewSize().h / 2 }, v.zoom * ZOOM_STEP),
        );
        return;
      }
      if (matchesShortcut("architecture.zoom_out", e)) {
        cancelTween();
        setVp((v) =>
          zoomAt(v, { x: viewSize().w / 2, y: viewSize().h / 2 }, v.zoom / ZOOM_STEP),
        );
        return;
      }
      if (matchesShortcut("architecture.fit_document", e)) {
        e.preventDefault();
        fitDoc(false);
        return;
      }
      if (matchesShortcut("architecture.fit_selection", e)) {
        e.preventDefault();
        fitSel();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (tempHandCode && e.code === tempHandCode) {
        tempHandCode = null;
        setSpaceHand(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    });
  });

  function snapshotSession() {
    setSessionSnapshot(props.systemId, {
      viewport: vp(),
      selection: sel(),
      environmentId: props.environmentId ?? "all",
    });
  }

  function applyDoc(next: ArchitectureDocument, mode: CaptureMode = "immediately") {
    const before = props.document;
    const r = commit(history(), before, next, mode, {
      selectionBefore: sel(),
      selectionAfter: sel(),
    });
    setHistory(r.history);
    props.onDocumentChange(r.doc, mode);
    props.onViewportChange?.(vp());
  }

  // Auto layout: the cards spring to their new places while the edges, already routed
  // to the final layout, wait hidden until they land.
  const [arranging, setArranging] = createSignal(false);
  let arrangeTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on(() => props.arrangeRequest?.key, (key) => {
    const request = untrack(() => props.arrangeRequest);
    if (key === undefined || !request) return;
    applyDoc(request.world, "immediately");
    clearTimeout(arrangeTimer);
    if (!prefersReducedMotion()) {
      setArranging(true);
      arrangeTimer = setTimeout(() => setArranging(false), 480);
    }
    requestAnimationFrame(() => fitDoc(true));
  }, { defer: true }));
  onCleanup(() => clearTimeout(arrangeTimer));

  function doUndo() {
    const r = historyUndo(history(), props.document);
    setHistory(r.history);
    props.onDocumentChange(r.doc, "never");
    if (r.selection) setSel(r.selection);
  }

  function doRedo() {
    const r = historyRedo(history(), props.document);
    setHistory(r.history);
    props.onDocumentChange(r.doc, "never");
    if (r.selection) setSel(r.selection);
  }

  function doCopy() {
    const frag = buildFragment(props.document, sel());
    const json = serializeFragment(frag);
    setInternalClipboard(json);
    void navigator.clipboard?.writeText(json).catch(() => {});
  }

  async function doPaste() {
    let json = internalClipboard();
    try {
      const t = await navigator.clipboard?.readText();
      if (t && t.includes("formatVersion")) json = t;
    } catch {
      /* ignore */
    }
    if (!json) return;
    const frag = parseFragment(json);
    if (!frag) return;
    const n = pasteCount() + 1;
    setPasteCount(n);
    const { doc, newSelection } = pasteFragment(props.document, frag, {
      x: 24 * n,
      y: 24 * n,
    });
    markNodesEntering(newSelection.nodeIds);
    applyDoc(doc, "immediately");
    setSel(newSelection);
  }

  function doDelete() {
    if (
      sel().nodeIds.length + sel().relationshipIds.length + sel().boundaryIds.length ===
      0
    )
      return;
    if (props.nested && props.onNestDisconnect) {
      for (const id of sel().relationshipIds) {
        const edge = props.document.relationships.find((r) => r.id === id);
        if (edge && isAtlasUsesEdge(edge)) props.onNestDisconnect(edge.sourceNodeId, edge.targetNodeId);
      }
    }
    applyDoc(deleteSelection(props.document, sel()), "immediately");
    setSel(emptySelection());
    props.onSelect(null);
  }

  function fitDoc(animated = false) {
    const shown = props.shownIds;
    const b = documentBounds(shown ? { ...props.document, nodes: props.document.nodes.filter((n) => shown.has(n.id)) } : props.document);
    const target = fitBounds(vp(), b, viewSize().w, viewSize().h, 48);
    if (animated) tweenTo(target);
    else {
      cancelTween();
      setVp(target);
    }
  }

  function fitSel() {
    const ids = new Set(sel().nodeIds);
    const nodes = props.document.nodes.filter((n) => ids.has(n.id));
    if (!nodes.length) {
      fitDoc(false);
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    cancelTween();
    setVp(fitBounds(vp(), { minX, minY, maxX, maxY }, viewSize().w, viewSize().h, 48));
  }

  function clientToLocal(e: { clientX: number; clientY: number }): Point {
    if (!rootEl) return { x: 0, y: 0 };
    const rect = rootEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function openCatalog(originDoc: Point | null) {
    setPlaceOrigin(originDoc);
    setCatalogOpen(true);
    setConfigureDef(null);
    setConfigureInitial(null);
    setPendingPlace(null);
  }

  function commitPlaceAt(
    def: ComponentTypeDefinition,
    config: PlaceConfig,
    docX: number,
    docY: number,
  ) {
    const size = defaultNodeSize(def.nodeType ?? def.id);
    const nodeType = String(def.nodeType ?? def.id);
    const life = lifecycleFromPlaceConfig(config);
    const next = docAddNode(props.document, {
      name: config.name,
      type: nodeType,
      subtype: def.subtype,
      provider: def.provider,
      environmentIds: environmentIdsFromConfig(config),
      description: config.description,
      owner: config.owner,
      metadata: metadataFromPlaceConfig(config),
      x: docX - size.width / 2,
      y: docY - size.height / 2,
      width: size.width,
      height: size.height,
      ports: defaultPorts(nodeType),
      origin: "manual",
      state: life.state,
      linkStatus: life.linkStatus,
      resourceId: life.resourceId,
    });
    const created = next.nodes[next.nodes.length - 1]!;
    markNodesEntering([created.id]);
    setConfigureDef(null);
    setConfigureInitial(null);
    setPlaceOrigin(null);
    setPendingPlace(null);
    setTool("select");
    applyDoc(next, "immediately");
    setSel({ nodeIds: [created.id], relationshipIds: [], boundaryIds: [] });
    props.onSelect(created.id);
  }

  function placeConfigured(def: ComponentTypeDefinition, config: PlaceConfig) {
    const origin = placeOrigin();
    if (origin) {
      commitPlaceAt(def, config, origin.x, origin.y);
      return;
    }
    // No known origin: enter placement mode (click to place). Escape cancels.
    setConfigureDef(null);
    setConfigureInitial(null);
    setPendingPlace({ def, config });
    setTool("select");
    pushToast(`Click the canvas to place ${config.name}`);
  }

  function onCatalogSelect(def: ComponentTypeDefinition) {
    setCatalogOpen(false);
    if (def.placementKind === "action" || !def.placeable || def.placementKind === "boundary") {
      pushToast(`${def.label}: not available yet`);
      return;
    }
    setConfigureInitial(null);
    setConfigureDef(def);
  }

  function placeFromResource(resource: LinkableResource) {
    setCatalogOpen(false);
    const suggestion = suggestPlaceFromResource(resource);
    const typeKey = suggestion.suggestedComponentType ?? "service";
    const def =
      listCatalogTypes().find(
        (t) =>
          t.placeable &&
          t.placementKind === "node" &&
          (String(t.nodeType) === typeKey || t.id === typeKey || t.subtype === typeKey),
      ) ??
      getComponentType(typeKey) ??
      listCatalogTypes().find((t) => t.placeable && t.placementKind === "node");
    if (!def || !def.placeable) {
      pushToast("No placeable component type for this resource");
      return;
    }
    setConfigureInitial({
      name: suggestion.name,
      environmentId: suggestion.environmentId,
      resourceId: suggestion.resourceId,
    });
    setConfigureDef(def);
  }

  function startConnectFromCard(nodeId: string) {
    const node = props.document.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isNodeConnectable(node)) return;
    setTool("connect");
    setConnectFrom({ nodeId });
  }

  function setHighlightFromNode(nodeId: string) {
    const ids = new Set<string>([nodeId]);
    for (const r of props.document.relationships) {
      if (r.sourceNodeId === nodeId || r.targetNodeId === nodeId) {
        ids.add(r.sourceNodeId);
        ids.add(r.targetNodeId);
        ids.add(r.id);
      }
    }
    setHighlightIds(ids);
  }

  function envDimmed(nodeEnv?: string[]): boolean {
    const env = props.environmentId ?? "all";
    if (env === "all" || !env) return false;
    if (!nodeEnv || nodeEnv.length === 0) return false;
    const want = normalizeEnvironmentId(env);
    return !nodeEnv.some((id) => normalizeEnvironmentId(id) === want);
  }

  const filteredNodes = createMemo(() => {
    const q = (props.search ?? "").trim().toLowerCase();
    let nodes = props.document.nodes;
    if (q) {
      nodes = nodes.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.type.includes(q) ||
          n.id.toLowerCase().includes(q) ||
          (n.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    return nodes;
  });

  const visibleNodes = createMemo(() => {
    const vis = visibleDocumentRect(vp(), viewSize().w, viewSize().h, 200);
    return filteredNodes().filter((n) => {
      if (props.nested && nestLevelOf(n) === "system") return false;
      return rectsIntersect(vis, { x: n.x, y: n.y, width: n.width, height: n.height });
    });
  });
  const visibleNodeIds = createMemo(() => visibleNodes().map((n) => n.id));
  const nodeById = (id: string) => props.document.nodes.find((n) => n.id === id);

  // Pointer interaction state
  let dragMode:
    | null
    | "pan"
    | "marquee"
    | "nodes"
    | "boundary"
    | "edge"
    | "connect" = null;
  let dragStartScreen: Point = { x: 0, y: 0 };
  let suppressOpenUntil = 0;
  let dragStartDoc: Point = { x: 0, y: 0 };
  let dragVp: Viewport = vp();
  let nodeOrigins = new Map<string, { x: number; y: number }>();
  let boundaryOrigin: { id: string; x: number; y: number } | null = null;
  let marqueeStartDoc: Point = { x: 0, y: 0 };
  let edgeDrag: {
    relId: string;
    segmentIndex: number;
    startDoc: Point;
    origManual: Point[] | undefined;
  } | null = null;
  let nodeDragRaf = 0;
  let nextDragOffset = { dx: 0, dy: 0 };
  let rightPanMoved = false;
  let rightPanActive = false;
  let rightPanReleaseRaf = 0;
  let pendingEmptyContextMenu: {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    kind: "empty" | "multi";
  } | null = null;

  const dragOffsetForNode = (id: string) =>
    draggedNodeIds().has(id) ? nodeDragOffset() : null;

  const effectiveNode = (n: ArchNode | undefined): ArchNode | undefined => {
    if (!n) return n;
    if (draggedNodeIds().has(n.id)) {
      const off = nodeDragOffset();
      if (off) return { ...n, x: n.x + off.dx, y: n.y + off.dy };
    }
    const card = previewCard(n.id);
    const frame = previewFrame(n.id);
    if (card || frame) return { ...n, ...card, ...frame };
    return n;
  };

  /** Nodes that can accept a connection from the current source. */
  const connectTargets = createMemo(() => {
    const from = connectFrom();
    if (!from) return null;
    const source = props.document.nodes.find((n) => n.id === from.nodeId);
    if (!source) return null;
    const set = new Set<string>([from.nodeId]);
    for (const n of props.document.nodes) {
      if (n.id === from.nodeId || !isNodeConnectable(n)) continue;
      const suggestions = suggestRelationshipTypes(source, n);
      const type = connectQuickType() ?? suggestions[0] ?? "calls";
      if (canConnect(source, n, type).ok) set.add(n.id);
    }
    return set;
  });

  function nodeIdFromHit(hit: ReturnType<typeof hitTest>): string | null {
    if (hit.kind === "port") return hit.nodeId;
    if (hit.kind === "node") return hit.id;
    return null;
  }

  function portFromHit(
    hit: ReturnType<typeof hitTest>,
  ): { nodeId: string; portId: string } | null {
    if (hit.kind === "port") return { nodeId: hit.nodeId, portId: hit.portId };
    return null;
  }

  function clearHoverState() {
    setHoveredId(null);
    setHoveredNodeId(null);
    setHoveredPort(null);
  }

  function applyHoverFromHit(hit: ReturnType<typeof hitTest>) {
    setHoveredId(hit.kind !== "empty" ? hit.id : null);
    setHoveredNodeId(nodeIdFromHit(hit));
    setHoveredPort(portFromHit(hit));
  }

  function onPointerDown(e: PointerEvent) {
    if (!rootEl) return;
    // Don't steal pointer while catalog dialog is open (Portal is outside, but safety).
    if (catalogOpen() || configureDef() || relTypeMenuId()) return;
    cancelTween();
    if (rightPanReleaseRaf) {
      cancelAnimationFrame(rightPanReleaseRaf);
      rightPanReleaseRaf = 0;
    }
    setContextMenu(null);
    rootEl.setPointerCapture(e.pointerId);
    const screen = clientToLocal(e);
    const docPt = screenToDocument(vp(), screen);

    const pending = pendingPlace();
    if (pending && e.button === 0) {
      commitPlaceAt(pending.def, pending.config, docPt.x, docPt.y);
      return;
    }

    const t = effectiveTool();

    if (e.button === 1 || t === "hand" || (e.button === 0 && e.altKey)) {
      dragMode = "pan";
      setPanning(true);
      dragStartScreen = screen;
      dragVp = vp();
      return;
    }

    // Right button: empty canvas = pan drag; cards/edges keep their context menu
    // via the contextmenu event instead.
    if (e.button === 2) {
      if (hitTest(hitDocument(), docPt).kind === "empty") {
        dragMode = "pan";
        rightPanActive = true;
        rightPanMoved = false;
        pendingEmptyContextMenu = null;
        setPanning(true);
        dragStartScreen = screen;
        dragVp = vp();
      }
      return;
    }

    const hit = hitTest(hitDocument(), docPt, { showPorts: true });

    // Port drag always starts a connection from that card (no global Connect tool).
    if (e.button === 0 && hit.kind === "port") {
      setTool("connect");
      setConnectFrom({ nodeId: hit.nodeId });
      setConnectPt(docPt);
      dragMode = "connect";
      return;
    }

    if (t === "connect" && e.button === 0) {
      if (hit.kind === "node") {
        const node = props.document.nodes.find((candidate) => candidate.id === hit.id);
        if (!connectFrom() && node && isNodeConnectable(node)) {
          setConnectFrom({ nodeId: hit.id });
          setConnectPt(docPt);
          dragMode = "connect";
          return;
        }
      }
    }

    if (e.button === 0 && (t === "select" || t === "connect")) {
      if (hit.kind === "empty") {
        if (t === "connect") {
          setConnectFrom(null);
          setConnectPt(null);
          setTool("select");
        }
        if (t === "select") {
          marqueeStartDoc = docPt;
          dragMode = "marquee";
          dragStartScreen = screen;
        }
        return;
      }

      if (hit.kind === "node") {
        if (t === "connect" && connectFrom()) {
          setConnectPt(docPt);
          dragMode = "connect";
          return;
        }
        const nextSel = selectClick(sel(), { kind: "node", id: hit.id }, e.shiftKey);
        setSel(nextSel);
        if (t !== "select") props.onSelect(nextSel.nodeIds[0] ?? null);
        if (t === "select") {
          dragMode = "nodes";
          dragStartDoc = docPt;
          dragStartScreen = screen;
          nodeOrigins = new Map(
            props.document.nodes
              .filter((n) => nextSel.nodeIds.includes(n.id) && !n.locked)
              .map((n) => [n.id, { x: n.x, y: n.y }]),
          );
          const dragged = new Set(nodeOrigins.keys());
          if (props.nested) {
            const parentOf = (id: string) =>
              nestParentId(props.document.nodes.find((node) => node.id === id));
            for (const node of props.document.nodes) {
              for (const root of nodeOrigins.keys()) {
                if (descendantIds(root, parentOf)(node.id)) dragged.add(node.id);
              }
            }
          }
          setNestPreview(null);
          setDraggedNodeIds(dragged);
          setDropTargetId(null);
        }
        return;
      }

      if (hit.kind === "relationship" && t === "select") {
        const alreadySelected =
          sel().relationshipIds.length === 1 &&
          sel().relationshipIds[0] === hit.id &&
          sel().nodeIds.length === 0 &&
          sel().boundaryIds.length === 0;
        setSel(selectClick(sel(), { kind: "relationship", id: hit.id }, e.shiftKey));
        if (alreadySelected && !e.shiftKey) {
          const r = props.document.relationships.find((x) => x.id === hit.id);
          const a = r && props.document.nodes.find((n) => n.id === r.sourceNodeId);
          const b = r && props.document.nodes.find((n) => n.id === r.targetNodeId);
          if (r && a && b) {
            const route = resolveRelationshipRoute(a, b, r.manualPoints);
            edgeDrag = {
              relId: r.id,
              segmentIndex: nearestSegmentIndex(docPt, route),
              startDoc: docPt,
              origManual: r.manualPoints?.map((p) => ({ ...p })),
            };
            dragMode = "edge";
          }
        }
        return;
      }

      // Existing boundaries remain selectable/movable (no create UI).
      if (hit.kind === "boundary" && t === "select") {
        const nextSel = selectClick(sel(), { kind: "boundary", id: hit.id }, e.shiftKey);
        setSel(nextSel);
        dragMode = "boundary";
        dragStartDoc = docPt;
        const b = props.document.boundaries.find((x) => x.id === hit.id);
        if (b) boundaryOrigin = { id: b.id, x: b.x, y: b.y };
        return;
      }
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!rootEl) return;
    const screen = clientToLocal(e);
    const docPt = screenToDocument(vp(), screen);

    if (!dragMode) {
      if (e.pointerType === "mouse" && !catalogOpen() && !configureDef() && !relTypeMenuId()) {
        applyHoverFromHit(hitTest(hitDocument(), docPt, { showPorts: true }));
      } else {
        clearHoverState();
      }
      return;
    }


    if (dragMode === "pan") {
      const dx = screen.x - dragStartScreen.x;
      const dy = screen.y - dragStartScreen.y;
      if (
        rightPanActive
        && Math.hypot(dx, dy) >= MARQUEE_ACTIVATION_DISTANCE
      ) {
        rightPanMoved = true;
      }
      setVp(panBy(dragVp, dx, dy));
      return;
    }

    if (dragMode === "marquee") {
      const screenDistance = Math.hypot(
        screen.x - dragStartScreen.x,
        screen.y - dragStartScreen.y,
      );
      if (screenDistance < MARQUEE_ACTIVATION_DISTANCE) {
        setMarquee(null);
        return;
      }
      const x = Math.min(marqueeStartDoc.x, docPt.x);
      const y = Math.min(marqueeStartDoc.y, docPt.y);
      const w = Math.abs(docPt.x - marqueeStartDoc.x);
      const h = Math.abs(docPt.y - marqueeStartDoc.y);
      setMarquee({ x, y, w, h });
      return;
    }

    if (dragMode === "connect") {
      setConnectPt(docPt);
      const hit = hitTest(hitDocument(), docPt, { showPorts: true });
      setHoveredNodeId(nodeIdFromHit(hit));
      setHoveredPort(portFromHit(hit));
      return;
    }

    if (dragMode === "edge" && edgeDrag) {
      const drag = edgeDrag;
      const r = props.document.relationships.find((x) => x.id === drag.relId);
      const a = r && props.document.nodes.find((n) => n.id === r.sourceNodeId);
      const b = r && props.document.nodes.find((n) => n.id === r.targetNodeId);
      if (r && a && b) {
        const route = resolveRelationshipRoute(a, b, drag.origManual);
        const idx = Math.min(drag.segmentIndex, route.length - 2);
        const delta = {
          x: docPt.x - drag.startDoc.x,
          y: docPt.y - drag.startDoc.y,
        };
        if (delta.x !== 0 || delta.y !== 0) {
          const moved = moveRouteSegment(route, idx, delta);
          const interior = moved.slice(1, -1);
          applyDoc(
            updateRelationship(props.document, r.id, {
              manualPoints: interior.length ? interior : undefined,
            }),
            "eventually",
          );
        }
      }
      return;
    }

    if (dragMode === "nodes") {
      nextDragOffset = { dx: docPt.x - dragStartDoc.x, dy: docPt.y - dragStartDoc.y };
      if (props.nested && nodeOrigins.size === 1) {
        const dragged = nestHits().find((node) => nodeOrigins.has(node.id));
        if (dragged) {
          const decision = decideDrop({
            dragged,
            cursor: docPt,
            nextTopLeft: { x: dragged.x + nextDragOffset.dx, y: dragged.y + nextDragOffset.dy },
            nodes: nestHits(),
            skip: draggedNodeIds(),
            rootParentId: nestRootOf(dragged.id),
          });
          // Leaving for the system has no frame to light up.
          const entering = decision.kind === "reparent" && decision.parentId !== nestRootOf(dragged.id)
            ? decision.parentId
            : null;
          planNestPreview(dragged, decision, { x: dragged.x + nextDragOffset.dx, y: dragged.y + nextDragOffset.dy });
          setDropTargetId(entering);
        }
      } else if (props.nested) {
        setDropTargetId(null);
      }
      if (!nodeDragRaf) {
        nodeDragRaf = requestAnimationFrame(() => {
          setNodeDragOffset(nextDragOffset);
          nodeDragRaf = 0;
        });
      }
      return;
    }

    if (dragMode === "boundary" && boundaryOrigin) {
      const origin = boundaryOrigin;
      const dx = docPt.x - dragStartDoc.x;
      const dy = docPt.y - dragStartDoc.y;
      // reset from origin each move: rebuild from props.document with absolute
      const b = props.document.boundaries.find((x) => x.id === origin.id);
      if (!b) return;
      const odx = origin.x + dx - b.x;
      const ody = origin.y + dy - b.y;
      applyDoc(
        moveBoundaryWithMembers(props.document, origin.id, odx, ody, !e.altKey),
        "eventually",
      );
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!rootEl) return;
    try {
      rootEl.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    const screen = clientToLocal(e);
    const docPt = screenToDocument(vp(), screen);

    if (dragMode === "marquee") {
      if (marquee()) {
        const m = marquee()!;
        const mode = marqueeModeFromDrag(marqueeStartDoc.x, docPt.x);
        let s = selectMarquee(
          props.document,
          { x: m.x, y: m.y, width: m.w, height: m.h },
          mode,
        );
        if (e.shiftKey) {
          s = {
            nodeIds: Array.from(new Set([...sel().nodeIds, ...s.nodeIds])),
            relationshipIds: Array.from(new Set([...sel().relationshipIds, ...s.relationshipIds])),
            boundaryIds: Array.from(new Set([...sel().boundaryIds, ...s.boundaryIds])),
          };
        }
        setSel(s);
        props.onSelect(s.nodeIds[0] ?? null);
        setMarquee(null);
      } else {
        if (!e.shiftKey) {
          setSel(emptySelection());
          props.onSelect(null);
        }
      }
    }

    if (dragMode === "nodes") {
      if (nodeDragRaf) {
        cancelAnimationFrame(nodeDragRaf);
        nodeDragRaf = 0;
      }
      const off = nextDragOffset;
      const screenDistance = Math.hypot(screen.x - dragStartScreen.x, screen.y - dragStartScreen.y);
      const moved = screenDistance >= MARQUEE_ACTIVATION_DISTANCE && (off.dx !== 0 || off.dy !== 0);
      if (moved) suppressOpenUntil = performance.now() + 400;
      if (props.nested && moved && nodeOrigins.size === 1) {
        const dragged = nestHits().find((node) => nodeOrigins.has(node.id));
        const decision = dragged
          ? decideDrop({
              dragged,
              cursor: docPt,
              nextTopLeft: { x: dragged.x + off.dx, y: dragged.y + off.dy },
              nodes: nestHits(),
              skip: draggedNodeIds(),
              rootParentId: nestRootOf(dragged.id),
            })
          : { kind: "move" as const };
        if (decision.kind === "reject") {
          setNestPreview(null);
          springDragHome();
          nextDragOffset = { dx: 0, dy: 0 };
        } else if (decision.kind === "reparent") {
          const movedId = [...nodeOrigins.keys()][0]!;
          batch(() => {
            props.onNestReparent?.(movedId, decision.parentId, decision.x, decision.y);
            setNodeDragOffset(null);
            setDraggedNodeIds(new Set<string>());
            setDropTargetId(null);
          });
          nextDragOffset = { dx: 0, dy: 0 };
        } else if (dragged && commitNestReorder(dragged.id)) {
          // Settled on its fixed slot.
        } else if (off.dx !== 0 || off.dy !== 0) {
          commitNodeDrag(off);
        } else {
          setNodeDragOffset(null);
          setDraggedNodeIds(new Set<string>());
          setDropTargetId(null);
        }
      } else if (moved) {
        commitNodeDrag(off);
      } else {
        setNodeDragOffset(null);
        setDraggedNodeIds(new Set<string>());
        setDropTargetId(null);
        nextDragOffset = { dx: 0, dy: 0 };
        props.onSelect(sel().nodeIds[0] ?? null);
      }
    }

    if (dragMode === "boundary" || dragMode === "edge") {
      applyDoc(props.document, "immediately");
    }
    edgeDrag = null;

    if (dragMode === "pan" && rightPanActive) {
      const contextEventAlreadyHandled = pendingEmptyContextMenu !== null;
      if (!rightPanMoved && pendingEmptyContextMenu) {
        setContextMenu(pendingEmptyContextMenu);
      }
      rightPanActive = false;
      pendingEmptyContextMenu = null;
      if (contextEventAlreadyHandled || !rightPanMoved) {
        rightPanMoved = false;
      } else {
        rightPanReleaseRaf = requestAnimationFrame(() => {
          rightPanMoved = false;
          rightPanReleaseRaf = 0;
        });
      }
    }

    if (dragMode === "connect" && connectFrom()) {
      const hit = hitTest(hitDocument(), docPt, { showPorts: true });
      const from = connectFrom()!;
      let targetId: string | null = null;
      if (hit.kind === "port") {
        targetId = hit.nodeId;
      } else if (hit.kind === "node") {
        const target = props.document.nodes.find((candidate) => candidate.id === hit.id);
        if (target && isNodeConnectable(target)) targetId = hit.id;
      }
      if (targetId && targetId !== from.nodeId) {
        const source = props.document.nodes.find((n) => n.id === from.nodeId)!;
        const target = props.document.nodes.find((n) => n.id === targetId)!;
        const suggestions = suggestRelationshipTypes(source, target);
        const quick = connectQuickType();
        const type = quick ?? suggestions[0] ?? "calls";
        const check = canConnect(source, target, type);
        if (props.nested && props.onNestConnect) {
          // The model owns Atlas edges; the new edge appears once uses: is saved.
          props.onNestConnect(from.nodeId, targetId);
        } else if (check.ok) {
          const prevIds = new Set(props.document.relationships.map((r) => r.id));
          const next = addRelationship(props.document, {
            sourceNodeId: from.nodeId,
            targetNodeId: targetId,
            type,
          });
          applyDoc(next, "immediately");
          const created = next.relationships.find((r) => !prevIds.has(r.id));
          if (created) {
            setSel({
              nodeIds: [],
              relationshipIds: [created.id],
              boundaryIds: [],
            });
            // Open type menu when the type was recommended (not quick-picked).
            if (!quick) setRelTypeMenuId(created.id);
          }
        }
      }
      setConnectFrom(null);
      setConnectPt(null);
      setHoveredNodeId(null);
      setHoveredPort(null);
      setTool("select");
    }

    dragMode = null;
    setPanning(false);
    boundaryOrigin = null;
    nodeOrigins = new Map();
  }

  function onWheel(e: WheelEvent) {
    if (!rootEl) return;
    e.preventDefault();
    const pendingZoom = zoomTarget;
    cancelTween();
    const screen = clientToLocal(e);
    // Pinch (ctrl/meta) and mouse wheel (line/page deltas) zoom.
    // Trackpad two-finger pan stays pixel deltas without modifiers.
    const isPinch = e.ctrlKey || e.metaKey;
    const isMouseWheel = e.deltaMode === 1 || e.deltaMode === 2;
    if (isPinch || isMouseWheel) {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 20; // DOM_DELTA_LINE — stronger mouse notches
      else if (e.deltaMode === 2) dy *= Math.max(viewSize().h, 1); // DOM_DELTA_PAGE
      let factor = Math.exp(-dy * WHEEL_ZOOM_GAIN);
      const max = WHEEL_ZOOM_MAX_STEP;
      const min = 1 / WHEEL_ZOOM_MAX_STEP;
      if (factor > max) factor = max;
      if (factor < min) factor = min;
      const base = pendingZoom ?? vp().zoom;
      const next = zoomAt({ ...vp(), zoom: base }, screen, base * factor).zoom;
      if (prefersReducedMotion()) {
        setVp((v) => zoomAt(v, screen, v.zoom * factor));
      } else {
        zoomTarget = next;
        zoomAnchor = screen;
        zoomRaf = requestAnimationFrame(zoomTick);
      }
    } else {
      setVp((v) => panBy(v, -e.deltaX, -e.deltaY));
    }
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    const screen = clientToLocal(e);
    const docPt = screenToDocument(vp(), screen);
    const hit = hitTest(hitDocument(), docPt);
    if (rightPanMoved) {
      if (rightPanReleaseRaf) {
        cancelAnimationFrame(rightPanReleaseRaf);
        rightPanReleaseRaf = 0;
      }
      rightPanActive = false;
      rightPanMoved = false;
      pendingEmptyContextMenu = null;
      return;
    }
    if (hit.kind === "node") {
      setSel({ nodeIds: [hit.id], relationshipIds: [], boundaryIds: [] });
      props.onSelect(hit.id);
      setContextMenu({ x: screen.x, y: screen.y, clientX: e.clientX, clientY: e.clientY, kind: "node", id: hit.id });
    } else if (hit.kind === "relationship") {
      setSel({ nodeIds: [], relationshipIds: [hit.id], boundaryIds: [] });
      setContextMenu({ x: screen.x, y: screen.y, clientX: e.clientX, clientY: e.clientY, kind: "relationship", id: hit.id });
    } else {
      const nextContextMenu = {
        x: screen.x,
        y: screen.y,
        clientX: e.clientX,
        clientY: e.clientY,
        kind: sel().nodeIds.length > 1 ? ("multi" as const) : ("empty" as const),
      };
      if (rightPanActive) {
        pendingEmptyContextMenu = nextContextMenu;
        return;
      }
      if (!rightPanMoved) setContextMenu(nextContextMenu);
    }
    rightPanActive = false;
    rightPanMoved = false;
  }

  function onDblClick(e: MouseEvent) {
    if (performance.now() < suppressOpenUntil) return;
    const screen = clientToLocal(e);
    const docPt = screenToDocument(vp(), screen);
    const hit = hitTest(hitDocument(), docPt);
    if (hit.kind === "node") {
      snapshotSession();
      props.onOpenNode(hit.id);
      return;
    }
    if (hit.kind === "empty") {
      openCatalog(docPt);
    }
  }

  const worldStyle = () => ({
    transform: `translate(${vp().x}px, ${vp().y}px) scale(${vp().zoom})`,
    "transform-origin": "0 0",
    position: "absolute" as const,
    left: "0",
    top: "0",
    width: "1px",
    height: "1px",
  });

  return (
    <div class="relative flex h-full min-h-0 flex-col">
      <div
        ref={rootEl}
        class="relative min-h-0 flex-1 overflow-hidden bg-[var(--color-surface)]"
        classList={{ "architecture-canvas-nesting": Boolean(props.nested) }}
        data-nest-drag={draggedNodeIds().size > 0 ? "" : undefined}
        tabIndex={0}
        aria-label="Architecture canvas"
        data-detail-focus-fallback
        style={{
          cursor: panning()
            ? "grabbing"
            : effectiveTool() === "hand"
              ? "grab"
              : effectiveTool() === "connect" || hoveredPort()
                ? "crosshair"
                : "default",
          "touch-action": "none",
          "overscroll-behavior-x": "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          clearHoverState();
        }}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
        onDblClick={onDblClick}
      >
        {/* Dotted background */}
        <div
          class="pointer-events-none absolute"
          style={{
            top: `-${GRID_OVERSCAN}px`,
            left: `-${GRID_OVERSCAN}px`,
            right: `-${GRID_OVERSCAN}px`,
            bottom: `-${GRID_OVERSCAN}px`,
            "background-image":
              "radial-gradient(circle, var(--color-border-default) 1px, transparent 1px)",
            "background-size": `${gridSize()}px ${gridSize()}px`,
            "background-position": "0 0",
            transform: `translate3d(${gridPhase(vp().x)}px, ${gridPhase(vp().y)}px, 0)`,
          }}
        />
        <div
          class="architecture-canvas-edge-fade pointer-events-none absolute inset-0"
          aria-hidden
        />

        <div ref={worldEl} style={worldStyle()}>
          <Show when={!props.nested}>
          {/* Boundaries */}
          <For each={props.document.boundaries}>
            {(b) => (
              <div
                style={{
                  position: "absolute",
                  left: `${b.x}px`,
                  top: `${b.y}px`,
                  width: `${b.width}px`,
                  height: `${b.height}px`,
                  border: sel().boundaryIds.includes(b.id)
                    ? "1px solid var(--color-border-strong)"
                    : "1px solid var(--color-border-default)",
                  "border-radius": "10px",
                  background: "var(--color-surface)",
                  "pointer-events": "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "8px",
                    top: "6px",
                    "font-size": "10px",
                    color: "var(--color-text-muted)",
                    "letter-spacing": "0.04em",
                    "text-transform": "uppercase",
                  }}
                >
                  {b.name}
                </span>
              </div>
            )}
          </For>
          </Show>

          <AtlasDropHighlight
            target={(() => {
              const id = dropTargetId();
              const node = effectiveNode(id ? props.document.nodes.find((item) => item.id === id) : undefined);
              if (!node) return null;
              return { x: node.x, y: node.y, width: node.width, height: node.height };
            })()}
          />
          <AtlasDropHighlight slot target={activePreview()?.slot ?? null} />

          {/* Edges */}
          <svg
            style={{
              // Auto layout: hidden while the cards settle, then back already routed.
              visibility: arranging() ? "hidden" : undefined,
              position: "absolute",
              left: 0,
              top: 0,
              overflow: "visible",
              "pointer-events": "none",
              // Nested: above domain frames, below component cards (see AtlasCardFrame).
              "z-index": props.nested ? "5" : undefined,
            }}
          >
            <For each={relationshipIds()}>
              {(id) => {
                const rel = createMemo(() => relationshipById(id));
                const a = () => {
                  const r = rel();
                  return r
                    ? props.document.nodes.find((n) => n.id === r.sourceNodeId)
                    : undefined;
                };
                const b = () => {
                  const r = rel();
                  return r
                    ? props.document.nodes.find((n) => n.id === r.targetNodeId)
                    : undefined;
                };
                const route = createMemo(() => {
                  const r = rel();
                  const A = effectiveNode(a());
                  const B = effectiveNode(b());
                  if (!r || !A || !B) return null;
                  const pts = routeNodes(A, B, r.manualPoints, r.id);
                  return pointsToRoundedSvgPath(pts);
                });
                const selected = () => sel().relationshipIds.includes(id);
                const isHovered = () => hoveredId() === id;
                const appearance = () => {
                  const r = rel();
                  return r ? resolveRelationshipAppearance(r) : { dim: true as const };
                };
                const markers = () => relationshipMarkers(rel()?.direction ?? "forward");
                const visibleRoute = () => {
                  if (concealed(rel()?.sourceNodeId ?? "") || concealed(rel()?.targetNodeId ?? "")) return null;
                  return route();
                };
                return (
                  <Show when={visibleRoute()}>
                    {(d) => (
                      <g>
                        <path
                          d={d()}
                          fill="none"
                          stroke={
                            appearance().dim
                              ? "var(--color-text-disabled)"
                              : selected() || isHovered()
                                ? "var(--color-text-secondary)"
                                : "var(--color-text-muted)"
                          }
                          stroke-width={selected() || isHovered() ? 2 : 1.5}
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          marker-end={markers().end}
                          marker-start={markers().start}
                        />
                      </g>
                    )}
                  </Show>
                );
              }}
            </For>
            <Show when={connectFrom() && connectPt()}>
              {(() => {
                const cf = connectFrom();
                if (!cf) return null;
                const n = props.document.nodes.find((x) => x.id === cf.nodeId);
                if (!n) return null;
                const fromId = cf.nodeId;
                const hoverId = hoveredNodeId();
                const targets = connectTargets();
                const snapTarget =
                  hoverId &&
                  hoverId !== fromId &&
                  targets?.has(hoverId)
                    ? props.document.nodes.find((x) => x.id === hoverId)
                    : undefined;
                // When hovering a valid target, draw the real recommended edge
                // (orthogonal node→node). Free-floating drag stays dashed to the cursor.
                const pts = snapTarget
                  ? routeOrthogonalLine(n, snapTarget)
                  : routeOrthogonalLine(n, {
                      x: connectPt()?.x ?? 0,
                      y: connectPt()?.y ?? 0,
                      width: 0,
                      height: 0,
                    });
                const d = pointsToRoundedSvgPath(pts);
                return (
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--color-primary)"
                    stroke-width={snapTarget ? 2 : 1.5}
                    stroke-dasharray={snapTarget ? undefined : "4 3"}
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                );
              })()}
            </Show>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
            </defs>
          </svg>

          {/* Edge flow dots — CSS motion path, composited, desynced per edge */}
          <For each={relationshipIds()}>
            {(id) => {
              const rel = createMemo(() => relationshipById(id));
              const a = () => {
                const r = rel();
                return r
                  ? props.document.nodes.find((n) => n.id === r.sourceNodeId)
                  : undefined;
              };
              const b = () => {
                const r = rel();
                return r
                  ? props.document.nodes.find((n) => n.id === r.targetNodeId)
                  : undefined;
              };
              const route = createMemo(() => {
                const r = rel();
                const A = effectiveNode(a());
                const B = effectiveNode(b());
                if (!r || !A || !B) return null;
                const pts = routeNodes(A, B, r.manualPoints, r.id);
                let length = 0;
                for (let i = 1; i < pts.length; i++) {
                  const curr = pts[i];
                  const prev = pts[i - 1];
                  if (curr && prev) length += Math.hypot(curr.x - prev.x, curr.y - prev.y);
                }
                return { d: pointsToRoundedSvgPath(pts), length };
              });
              const appearance = () => {
                const r = rel();
                return r ? resolveRelationshipAppearance(r) : { dim: true as const };
              };
              const accent = () => {
                const A = a();
                return A ? nodeAccentColor(A) : "var(--color-chart-blue)";
              };
              onCleanup(() => {
                flowDots.delete(id);
                checkFlowLoop();
              });
              return (
                <Show
                  when={
                    route()
                    && !appearance().dim
                    && edgeFlowOn()
                    && !concealed(rel()?.sourceNodeId ?? "")
                    && !concealed(rel()?.targetNodeId ?? "")
                  }
                >
                  <div
                        ref={(el) => {
                          const prev = flowDots.get(id);
                          flowDots.set(id, {
                            el,
                            length: () => route()?.length ?? 0,
                            lastLength: prev?.lastLength ?? 0,
                          });
                          checkFlowLoop();
                        }}
                        class="architecture-canvas-edge-flow-dot"
                        aria-hidden
                        style={{
                          // Nested: same layer as the edges, above domain frames, under cards.
                          "z-index": props.nested ? "5" : undefined,
                          "offset-path": `path("${route()?.d ?? ""}")`,
                          "offset-distance": `${(
                            flowPhases.get(id) ?? (edgeFlowPhase(id) * (untrack(route)?.length ?? 0))
                          ).toFixed(1)}px`,
                          "--edge-flow-color": accent(),
                        }}
                  />
                </Show>
              );
            }}
          </For>

          {/* Marquee */}
          <Show when={marquee()}>
            {(m) => (
              <div
                style={{
                  position: "absolute",
                  left: `${m().x}px`,
                  top: `${m().y}px`,
                  width: `${m().w}px`,
                  height: `${m().h}px`,
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-surface-selected)",
                  "pointer-events": "none",
                }}
              />
            )}
          </Show>

          {/* Nodes — iterate ids so document identity churn does not remount cards */}
          <For each={visibleNodeIds()}>
            {(id) => {
              const n = () => nodeById(id)!;
              const selected = () => sel().nodeIds.includes(id);
              const dim = () => {
                if (envDimmed(n().environmentIds)) return true;
                const h = highlightIds();
                if (h && !h.has(id)) return true;
                return false;
              };
              const lodFar = () => vp().zoom < 0.45;
              const showHandles = () =>
                shouldShowConnectionHandles(
                  n(),
                  hoveredNodeId() === id ||
                    (connectTargets()?.has(id) ?? false) ||
                    (connectFrom() === null && effectiveTool() === "connect"),
                );
              const isConnectTarget = () =>
                connectFrom() !== null &&
                connectFrom()?.nodeId !== id &&
                hoveredNodeId() === id;
              const selectForAction = () => {
                setSel({ nodeIds: [id], relationshipIds: [], boundaryIds: [] });
                props.onSelect(id);
              };

              const domainFrame = () => props.nested && nestLevelOf(n()) === "domain";
              const body = domainFrame() ? (
                <div
                  class="atlas-domain-frame"
                  data-detail-opener
                  data-selected={selected() ? "" : undefined}
                  aria-hidden={concealed(id) ? true : undefined}
                >
                  <span class="atlas-domain-frame__label">
                    <ArchitectureNodeIcon
                      name={resolveNodeIconName(n())}
                      subtype={n().subtype}
                      provider={n().provider}
                      compact
                      tiny
                      seed={id}
                      dimmed={dim() || concealed(id)}
                    />
                    <span class="atlas-domain-frame__title">{n().name}</span>
                  </span>
                </div>
              ) : (
                  <ArchitectureNodeCard
                    id={id}
                    name={n().name}
                    type={n().type}
                    subtype={n().subtype}
                    provider={n().provider}
                    state={n().state}
                    x={props.nested ? 0 : n().x}
                    y={props.nested ? 0 : n().y}
                    width={n().width}
                    height={n().height}
                    selected={selected()}
                    dimmed={dim() || concealed(id)}
                    lodFar={lodFar()}
                    editing={editingId() === id}
                    entering={!props.nested && enteringNodes().has(id)}
                    onEnterEnd={() => completeNodeEntry(id)}
                    dragOffset={props.nested ? undefined : dragOffsetForNode(id)}
                    fill={Boolean(props.nested)}
                    nestParent={false}
                    onRenameEnd={(newName) => {
                      applyDoc(
                        updateNode(props.document, id, { name: newName }),
                        "immediately"
                      );
                      setEditingId(null);
                    }}
                    onRenameCancel={() => setEditingId(null)}
                    onActionOpenDetails={() => {
                      selectForAction();
                      snapshotSession();
                      props.onOpenNode(id);
                    }}
                    onActionRename={() => {
                      selectForAction();
                      setEditingId(id);
                    }}
                    onActionConnect={() => {
                      selectForAction();
                      startConnectFromCard(id);
                    }}
                    onActionHighlight={() => {
                      selectForAction();
                      setHighlightFromNode(id);
                    }}
                    onActionDuplicate={() => {
                      selectForAction();
                      doCopy();
                      void doPaste();
                    }}
                    onActionCopy={() => {
                      selectForAction();
                      doCopy();
                    }}
                    onActionDelete={() => {
                      selectForAction();
                      doDelete();
                    }}
                  />
              );
              const handles = (
                  <Show when={showHandles() && !domainFrame()}>
                    <div
                      class="pointer-events-none absolute z-[3]"
                      style={{
                        left: props.nested ? "0px" : `${n().x}px`,
                        top: props.nested ? "0px" : `${n().y}px`,
                        width: props.nested ? "100%" : `${n().width}px`,
                        height: props.nested ? "100%" : `${n().height}px`,
                        transform:
                          !props.nested && dragOffsetForNode(id)
                            ? `translate3d(${dragOffsetForNode(id)?.dx ?? 0}px, ${dragOffsetForNode(id)?.dy ?? 0}px, 0)`
                            : undefined,
                      }}
                      aria-hidden
                    >
                      <For each={HANDLE_SIDES}>
                        {(side: HandleSide) => {
                          const state = () =>
                            resolveHandleState({
                              nodeId: id,
                              side,
                              hoveredPort: hoveredPort(),
                              isConnectTarget: isConnectTarget(),
                            });
                          const posClass =
                            side === "left"
                              ? "absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"
                              : side === "right"
                                ? "absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2"
                                : side === "top"
                                  ? "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
                                  : "absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2";
                          return (
                            <span
                              class={`architecture-canvas-handle ${posClass}`}
                              data-side={side}
                              data-handle-state={state()}
                            >
                              <span class="architecture-canvas-handle-dot" />
                            </span>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
              );
              return (
                <Show
                  when={props.nested}
                  fallback={
                    <>
                      {body}
                      {handles}
                    </>
                  }
                >
                  <AtlasCardFrame
                    x={previewCard(id)?.x ?? n().x}
                    y={previewCard(id)?.y ?? n().y}
                    width={previewFrame(id)?.width ?? n().width}
                    height={previewFrame(id)?.height ?? n().height}
                    depth={n().zIndex}
                    concealed={concealed(id)}
                    dragging={draggedNodeIds().has(id)}
                    lift={nestLevelOf(n()) === "component"}
                    dragOffset={dragOffsetForNode(id) ?? null}
                    entering={enteringNodes().has(id)}
                    onEnterEnd={() => completeNodeEntry(id)}
                  >
                    <>
                      {body}
                      {handles}
                    </>
                  </AtlasCardFrame>
                </Show>
              );
            }}
          </For>

          {/* Relationship type control (midpoint) — above nodes so the menu is clickable */}
          <For each={props.document.relationships}>
            {(r) => {
              const a = () => props.document.nodes.find((n) => n.id === r.sourceNodeId);
              const b = () => props.document.nodes.find((n) => n.id === r.targetNodeId);
              return (
                <Show when={a() && b() && !concealed(r.sourceNodeId) && !concealed(r.targetNodeId)}>
                  {(() => {
                    const A = effectiveNode(a());
                    const B = effectiveNode(b());
                    if (!A || !B) return null;
                    const pts = routeNodes(A, B, r.manualPoints, r.id);
                    const mid = polylineMidpoint(pts);
                    if (!mid) return null;
                    const selected = () => sel().relationshipIds.includes(r.id);
                    const isHovered = () => hoveredId() === r.id;
                    const menuOpen = () => relTypeMenuId() === r.id;
                    const dim = resolveRelationshipAppearance(r).dim;
                    const active = () => selected() || isHovered() || menuOpen();
                    const suggestions = () => suggestRelationshipTypes(A, B);
                    const creatable = () => listCreatableRelationshipTypes();
                    const suggestedTypes = () => {
                      const allowed = new Set(creatable().map((t) => t.id));
                      return suggestions().filter((id) => allowed.has(id));
                    };
                    const otherTypes = () => {
                      const suggested = new Set(suggestedTypes());
                      return creatable().filter((t) => !suggested.has(t.id));
                    };
                    const triggerClass = () =>
                      [
                        "architecture-canvas-rel-control rounded-full",
                        active() ? "architecture-canvas-rel-control--active" : "",
                        dim ? "architecture-canvas-rel-control--dimmed" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                    return (
                      <Show when={active()}>
                        <div
                          class="absolute z-[4]"
                          style={{
                            left: `${mid.x}px`,
                            top: `${mid.y}px`,
                            transform: "translate(-50%, -50%)",
                          }}
                          onPointerDown={(event) => {
                            // Keep canvas from capturing / starting marquee or node drag.
                            event.stopPropagation();
                            setSel({
                              nodeIds: [],
                              relationshipIds: [r.id],
                              boundaryIds: [],
                            });
                          }}
                          onClick={(event) => event.stopPropagation()}
                          onDblClick={(event) => event.stopPropagation()}
                        >
                          <DropdownMenu
                            open={menuOpen()}
                            onOpenChange={(open) => {
                              if (open) {
                                setRelTypeMenuId(r.id);
                                setSel({
                                  nodeIds: [],
                                  relationshipIds: [r.id],
                                  boundaryIds: [],
                                });
                              } else if (relTypeMenuId() === r.id) {
                                setRelTypeMenuId(null);
                              }
                            }}
                          >
                            <Tooltip.Root
                              placement="top"
                              openDelay={280}
                              disabled={menuOpen()}
                            >
                              <Tooltip.Trigger
                                asChild={(triggerProps) => (
                                  <span
                                    {...triggerProps({
                                      class: "inline-flex",
                                    })}
                                  >
                                    <DropdownMenuTrigger
                                      class={triggerClass()}
                                      aria-label={`Change relationship type. Current: ${labelForRelType(r.type)}`}
                                    >
                                      <RelationshipTypeIcon type={r.type} size={14} />
                                    </DropdownMenuTrigger>
                                  </span>
                                )}
                              />
                              <Tooltip.Content>
                                {labelForRelType(r.type)}
                              </Tooltip.Content>
                            </Tooltip.Root>
                            <DropdownMenuContent class="min-w-44">
                              <Show when={suggestedTypes().length > 0}>
                                <div class="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                                  Suggested
                                </div>
                                <For each={suggestedTypes()}>
                                  {(typeId) => (
                                    <DropdownMenuItem
                                      value={`suggested:${typeId}`}
                                      onSelect={() => {
                                        applyDoc(
                                          updateRelationship(props.document, r.id, {
                                            type: typeId,
                                          }),
                                          "immediately",
                                        );
                                        setRelTypeMenuId(null);
                                      }}
                                    >
                                      <RelationshipTypeIcon
                                        type={typeId}
                                        size={14}
                                        class="shrink-0 text-[var(--color-text-secondary)]"
                                      />
                                      <span class="flex-1">{labelForRelType(typeId)}</span>
                                      <Show when={r.type === typeId}>
                                        <Check size={12} aria-hidden />
                                      </Show>
                                    </DropdownMenuItem>
                                  )}
                                </For>
                              </Show>
                              <Show when={otherTypes().length > 0}>
                                <Show when={suggestedTypes().length > 0}>
                                  <div class="my-1 border-t border-[var(--color-border-subtle)]" />
                                  <div class="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                                    Other
                                  </div>
                                </Show>
                                <For each={otherTypes()}>
                                  {(type) => (
                                    <DropdownMenuItem
                                      value={type.id}
                                      onSelect={() => {
                                        applyDoc(
                                          updateRelationship(props.document, r.id, {
                                            type: type.id,
                                          }),
                                          "immediately",
                                        );
                                        setRelTypeMenuId(null);
                                      }}
                                    >
                                      <RelationshipTypeIcon
                                        type={type.id}
                                        size={14}
                                        class="shrink-0 text-[var(--color-text-secondary)]"
                                      />
                                      <span class="flex-1">{type.label}</span>
                                      <Show when={r.type === type.id}>
                                        <Check size={12} aria-hidden />
                                      </Show>
                                    </DropdownMenuItem>
                                  )}
                                </For>
                              </Show>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Show>
                    );
                  })()}
                </Show>
              );
            }}
          </For>

          {/* Route edit points for the selected relationship */}
          <For each={props.document.relationships}>
            {(r) => (
              <Show when={sel().relationshipIds.includes(r.id)}>
                {(() => {
                  const a = effectiveNode(props.document.nodes.find((n) => n.id === r.sourceNodeId));
                  const b = effectiveNode(props.document.nodes.find((n) => n.id === r.targetNodeId));
                  if (!a || !b) return null;
                  const pts = routeNodes(a, b, r.manualPoints, r.id);
                  const interior = pts.slice(1, -1);
                  return (
                    <For each={interior}>
                      {(p, i) => (
                        <div
                          class="architecture-canvas-waypoint absolute z-[3] rounded-full"
                          style={{ left: `${p.x}px`, top: `${p.y}px` }}
                          title="Double-click to remove point. Drag an edge segment to move its route."
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onDblClick={(event) => {
                            event.stopPropagation();
                            const next = removeRouteVertex(pts, i() + 1);
                            const nextInterior = next.slice(1, -1);
                            applyDoc(
                              updateRelationship(props.document, r.id, {
                                manualPoints: nextInterior.length
                                  ? nextInterior
                                  : undefined,
                              }),
                              "immediately",
                            );
                          }}
                        />
                      )}
                    </For>
                  );
                })()}
              </Show>
            )}
          </For>
        </div>

        {/* Minimap */}
        <Minimap
          doc={props.document}
          vp={vp()}
          viewW={viewSize().w}
          viewH={viewSize().h}
          onNavigate={(nx, ny) => tweenTo({ ...vp(), x: nx, y: ny })}
        />

        <AddToArchitectureDialog
          open={catalogOpen()}
          prefs={typePrefs}
          resources={resourceLinkPort().listCandidates({ typeFilterStrict: false })}
          onClose={() => setCatalogOpen(false)}
          onSelect={onCatalogSelect}
          onSelectResource={placeFromResource}
          onUnavailableAction={(def) => pushToast(`${def.label}: not available yet`)}
        />

        <ConfigureComponentDialog
          open={Boolean(configureDef())}
          def={configureDef()}
          environments={projectEnvironments()}
          resourceLinkPort={resourceLinkPort()}
          initial={configureInitial()}
          onClose={() => {
            setConfigureDef(null);
            setConfigureInitial(null);
          }}
          onConfirm={(config) => {
            const def = configureDef();
            if (!def) return;
            placeConfigured(def, config);
          }}
        />

        {/* Context menu */}
        <ContextMenu.Root
          open={!!contextMenu()}
          onOpenChange={(open) => {
            if (!open) setContextMenu(null);
          }}
          anchorPoint={
            contextMenu()
              ? { x: contextMenu()?.clientX ?? 0, y: contextMenu()?.clientY ?? 0 }
              : null
          }
        >
          <ContextMenu.Content>
            <Show when={contextMenu()}>
              {(cm) => (
                <>
                  <Show when={cm().kind === "empty"}>
                    <ContextMenu.Item
                      value="add"
                      onSelect={() => {
                        openCatalog(screenToDocument(vp(), { x: cm().x, y: cm().y }));
                      }}
                    >
                      Add component here
                    </ContextMenu.Item>
                    <ContextMenu.Item value="paste" onSelect={() => { void doPaste(); }}>Paste</ContextMenu.Item>
                    <ContextMenu.Item value="select-all" onSelect={() => { setSel(selectAll(props.document)); }}>Select all</ContextMenu.Item>
                    <ContextMenu.Item value="fit" onSelect={() => { fitDoc(true); }}>Fit architecture</ContextMenu.Item>
                  </Show>
                  <Show when={cm().kind === "node"}>
                    <ContextMenu.Item
                      value="details"
                      onSelect={() => {
                        snapshotSession();
                        const id = cm().id;
                        if (id) props.onOpenNode(id);
                      }}
                    >
                      Open details
                    </ContextMenu.Item>
                    <ContextMenu.Item value="rename" onSelect={() => { const id = cm().id; if (id) setEditingId(id); }}>
                      Rename
                    </ContextMenu.Item>
                    <ContextMenu.Item value="connect" onSelect={() => { const id = cm().id; if (id) startConnectFromCard(id); }}>
                      Connect
                    </ContextMenu.Item>
                    <ContextMenu.Item value="highlight" onSelect={() => { const id = cm().id; if (id) setHighlightFromNode(id); }}>
                      Highlight dependencies
                    </ContextMenu.Item>
                    <ContextMenu.Item value="duplicate" onSelect={() => { doCopy(); void doPaste(); }}>Duplicate</ContextMenu.Item>
                    <ContextMenu.Item value="copy" onSelect={doCopy}>Copy</ContextMenu.Item>
                    <ContextMenu.Item value="delete" danger onSelect={doDelete}>Delete</ContextMenu.Item>
                  </Show>
                  <Show when={cm().kind === "relationship"}>
                    <Show
                      when={
                        props.document.relationships.find((relationship) => relationship.id === cm().id)
                          ?.manualPoints?.length
                      }
                    >
                      <ContextMenu.Item
                        value="reset-route"
                        onSelect={() => {
                          applyDoc(
                            updateRelationship(props.document, cm().id!, {
                              manualPoints: undefined,
                            }),
                            "immediately",
                          );
                        }}
                      >
                        Reset route
                      </ContextMenu.Item>
                    </Show>
                    <ContextMenu.Item value="delete" danger onSelect={doDelete}>
                      Delete
                    </ContextMenu.Item>
                  </Show>
                  <Show when={cm().kind === "multi"}>
                    <ContextMenu.Item value="duplicate" onSelect={() => { doCopy(); void doPaste(); }}>Duplicate</ContextMenu.Item>
                    <ContextMenu.Item value="delete" danger onSelect={doDelete}>Delete</ContextMenu.Item>
                  </Show>
                </>
              )}
            </Show>
          </ContextMenu.Content>
        </ContextMenu.Root>
      </div>
    </div>
  );
}


function Minimap(props: {
  doc: ArchitectureDocument;
  vp: Viewport;
  viewW: number;
  viewH: number;
  onNavigate: (x: number, y: number) => void;
}) {
  const W = 140;
  const H = 96;
  const b = () => documentBounds(props.doc);
  const scale = () => {
    const bb = b();
    const w = Math.max(1, bb.maxX - bb.minX);
    const h = Math.max(1, bb.maxY - bb.minY);
    return Math.min((W - 8) / w, (H - 8) / h);
  };

  return (
    <div
      class="absolute bottom-3 right-3 z-10 overflow-hidden rounded-[var(--radius-menu)] border border-[var(--color-border-default)] bg-[var(--color-surface)]"
      style={{ width: `${W}px`, height: `${H}px` }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left - 4;
        const my = e.clientY - rect.top - 4;
        const bb = b();
        const s = scale();
        const docX = bb.minX + mx / s;
        const docY = bb.minY + my / s;
        props.onNavigate(
          props.viewW / 2 - docX * props.vp.zoom,
          props.viewH / 2 - docY * props.vp.zoom,
        );
      }}
    >
      <For each={props.doc.nodes}>
        {(n) => {
          const s = scale();
          const bb = b();
          return (
            <div
              style={{
                position: "absolute",
                left: `${4 + (n.x - bb.minX) * s}px`,
                top: `${4 + (n.y - bb.minY) * s}px`,
                width: `${Math.max(2, n.width * s)}px`,
                height: `${Math.max(2, n.height * s)}px`,
                background: "var(--color-border-default)",
                "border-radius": "1px",
              }}
            />
          );
        }}
      </For>
      {(() => {
        const s = scale();
        const bb = b();
        const tl = screenToDocument(props.vp, { x: 0, y: 0 });
        const br = screenToDocument(props.vp, { x: props.viewW, y: props.viewH });
        return (
          <div
            style={{
              position: "absolute",
              left: `${4 + (tl.x - bb.minX) * s}px`,
              top: `${4 + (tl.y - bb.minY) * s}px`,
              width: `${Math.max(4, (br.x - tl.x) * s)}px`,
              height: `${Math.max(4, (br.y - tl.y) * s)}px`,
              border: "1px solid var(--color-primary)",
              "pointer-events": "none",
            }}
          />
        );
      })()}
    </div>
  );
}
