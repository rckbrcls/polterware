import { createSignal, getOwner, onCleanup, type Accessor } from "solid-js";
import { createStore } from "zustand/vanilla";
import { canExpandDetail, isDocumentDetail } from "./detail-display";

export function createSelectionStore() {
  const [systemId, setSystemId] = createSignal<string | null>("sys-local");
  const [panel, setPanel] = createSignal<"architecture" | "ops" | "logs" | "settings" | "knowledge">("architecture");
  return { systemId, setSystemId, panel, setPanel };
}

export type FixtureMode = "force" | "fallback" | "off";

export type DetailTarget = {
  scopeId: string;
  entityId: string;
  entityKind: string;
};

export type DetailCollectionStatus = "idle" | "loading" | "ready" | "error";

export type DetailCollectionRegistration = {
  scopeId: string;
  status: DetailCollectionStatus;
  targets: readonly DetailTarget[];
  /** The collection offers entity detail. `false` hides the card and its reopen circle. */
  details?: boolean;
  /**
   * Resolve the first target when the collection first becomes ready with no selection.
   * `false` starts with the empty state until the user picks an entity.
   */
  selectFirst?: boolean;
};

type DetailPanelSessionState = {
  /** Visibility is transient and starts closed. */
  open: boolean;
  /** The lateral panel fills the collection surface when expanded. */
  expanded: boolean;
  /** The last registered collection offers details. */
  available: boolean;
  activeScope: string | null;
  activeTarget: DetailTarget | null;
  /** Last valid selection, retained when the canvas clears its visible selection. */
  lastTarget: DetailTarget | null;
  pendingTarget: DetailTarget | null;
  /** The scope whose selection was already resolved (automatically or by the user). */
  selectionScope: string | null;
  collectionStatus: DetailCollectionStatus;
};

export type DetailPanelState = DetailPanelSessionState & {
  registerCollection: (collection: DetailCollectionRegistration) => void;
  unregisterCollection: (scopeId: string) => void;
  requestTarget: (target: DetailTarget) => void;
  activateTarget: (target: DetailTarget) => void;
  clearTarget: (scopeId: string) => void;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  expand: () => void;
  restore: () => void;
  toggleExpanded: () => void;
};

export const detailPanelDefaultState: DetailPanelSessionState = {
  open: false,
  expanded: false,
  available: false,
  activeScope: null,
  activeTarget: null,
  lastTarget: null,
  pendingTarget: null,
  selectionScope: null,
  collectionStatus: "idle",
};

function targetsMatch(left: DetailTarget | null, right: DetailTarget | null): boolean {
  return left !== null
    && right !== null
    && left.scopeId === right.scopeId
    && left.entityId === right.entityId
    && left.entityKind === right.entityKind;
}

function containsTarget(targets: readonly DetailTarget[], target: DetailTarget | null, scopeId: string): target is DetailTarget {
  return target !== null
    && target.scopeId === scopeId
    && targets.some((candidate) => targetsMatch(candidate, target));
}

/** Global detail visibility is independent of selection and never persisted.
 * Registration resolves content; only explicit entity activation opens the inspector.
 */
export const detailPanelStore = createStore<DetailPanelState>()(
  (set, get) => ({
      ...detailPanelDefaultState,

      registerCollection: ({ scopeId, status, targets, details = true, selectFirst = true }) => {
        const state = get();
        const isScopeChange = state.activeScope !== scopeId;
        const base = {
          available: details,
          activeScope: scopeId,
          collectionStatus: status,
          ...(isScopeChange || !details ? { open: details && state.open && state.pendingTarget?.scopeId === scopeId, expanded: false } : {}),
          ...(isScopeChange ? { selectionScope: null, lastTarget: null } : {}),
        };

        if (status === "loading" || status === "idle") {
          set({
            ...base,
            activeTarget: isScopeChange ? null : state.activeTarget,
          });
          return;
        }

        if (status === "error") {
          set({
            ...base,
            activeTarget: state.activeTarget?.scopeId === scopeId ? state.activeTarget : null,
          });
          return;
        }

        const pendingTarget = containsTarget(targets, state.pendingTarget, scopeId) ? state.pendingTarget : null;
        const activeTarget = containsTarget(targets, state.activeTarget, scopeId) ? state.activeTarget : null;
        const selectionScope = isScopeChange ? null : state.selectionScope;
        const firstTarget = selectFirst && selectionScope !== scopeId ? targets[0] ?? null : null;
        set({
          ...base,
          activeTarget: pendingTarget ?? activeTarget ?? firstTarget,
          lastTarget: pendingTarget ?? activeTarget ?? firstTarget
            ?? (containsTarget(targets, state.lastTarget, scopeId) ? state.lastTarget : null),
          pendingTarget: state.pendingTarget?.scopeId === scopeId ? null : state.pendingTarget,
          selectionScope: scopeId,
        });
      },

      unregisterCollection: (scopeId) => {
        const state = get();
        if (state.activeScope !== scopeId) {
          return;
        }
        set({
          activeScope: null,
          lastTarget: null,
          open: state.open && state.pendingTarget !== null && state.pendingTarget.scopeId !== scopeId,
          activeTarget: null,
          selectionScope: null,
          expanded: false,
          collectionStatus: "idle",
          pendingTarget: state.pendingTarget?.scopeId === scopeId ? null : state.pendingTarget,
        });
      },

      requestTarget: (target) => {
        set({ pendingTarget: target, open: !isDocumentDetail(target.entityKind) });
      },

      activateTarget: (target) => {
        const state = get();
        set({
          activeScope: target.scopeId,
          activeTarget: target,
          lastTarget: target,
          pendingTarget: null,
          selectionScope: target.scopeId,
          open: !isDocumentDetail(target.entityKind),
          expanded: state.activeScope === target.scopeId ? state.expanded : false,
        });
      },

      clearTarget: (scopeId) => {
        const state = get();
        if (state.activeTarget?.scopeId !== scopeId) {
          return;
        }
        set({
          activeTarget: null,
          pendingTarget: state.pendingTarget?.scopeId === scopeId ? null : state.pendingTarget,
        });
      },

      show: () => {
        const state = get();
        set({ open: true, activeTarget: state.activeTarget
          ?? (state.lastTarget?.scopeId === state.activeScope ? state.lastTarget : null) });
      },

      hide: () => set({ open: false, expanded: false }),

      toggle: () => {
        if (get().open) get().hide();
        else get().show();
      },

      expand: () => {
        if (get().activeScope === null) return;
        const state = get();
        const target = state.activeTarget
          ?? (state.lastTarget?.scopeId === state.activeScope ? state.lastTarget : null);
        if (target && !canExpandDetail(target.entityKind)) return;
        set({ open: true, expanded: true, activeTarget: target });
      },

      restore: () => set({ expanded: false }),

      toggleExpanded: () => {
        if (get().expanded) get().restore();
        else get().expand();
      },
    }),
);

export function createDetailPanelSelector<T>(
  selector: (state: DetailPanelState) => T,
  equals: (left: T, right: T) => boolean = Object.is,
): Accessor<T> {
  let current = selector(detailPanelStore.getState());
  const [selected, setSelected] = createSignal(current, { equals: false });
  const unsubscribe = detailPanelStore.subscribe((state) => {
    const next = selector(state);
    if (equals(current, next)) {
      return;
    }

    current = next;
    setSelected(() => next);
  });

  if (getOwner()) {
    onCleanup(unsubscribe);
  }

  return selected;
}

export * from "./detail-display";
export * from "./shortcuts";
export * from "./remembered";
