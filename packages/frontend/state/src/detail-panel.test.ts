import { beforeEach, describe, expect, it } from "vitest";

import {
  detailPanelDefaultState,
  detailPanelStore,
  type DetailTarget,
} from "./index";

const scopeId = "project-alpha";
const nextScopeId = "project-beta";
const firstTarget: DetailTarget = { scopeId, entityId: "service-api", entityKind: "service" };
const secondTarget: DetailTarget = { scopeId, entityId: "worker-sync", entityKind: "process" };
const nextTarget: DetailTarget = { scopeId: nextScopeId, entityId: "database-primary", entityKind: "resource" };

function resetStore() {
  detailPanelStore.setState(detailPanelDefaultState);
}

function store() {
  return detailPanelStore.getState();
}

describe("detailPanelStore", () => {
  beforeEach(resetStore);

  it("starts closed and not expanded, and unavailable until a collection registers", () => {
    expect(store()).toMatchObject({
      open: false,
      expanded: false,
      available: false,
      activeScope: null,
      activeTarget: null,
      collectionStatus: "idle",
    });
  });

  it("has no placement, presence, or mode state", () => {
    for (const key of ["placement", "presence", "mode", "restoreMode", "outgoingTarget", "dismissible", "minimized", "minimize"]) {
      expect(store()).not.toHaveProperty(key);
    }
  });

  it("selects the first target when a new scope becomes ready", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });

    expect(store()).toMatchObject({
      available: true,
      activeScope: scopeId,
      activeTarget: firstTarget,
      collectionStatus: "ready",
    });
  });

  it("keeps a hidden sidebar hidden across collection switches", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().hide();

    store().unregisterCollection(scopeId);
    expect(store()).toMatchObject({ open: false, available: true });

    store().registerCollection({ scopeId: nextScopeId, status: "ready", targets: [nextTarget] });
    expect(store()).toMatchObject({ open: false, activeTarget: nextTarget });
  });

  it("closes on scope changes without auto-opening registered selections", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().activateTarget(firstTarget);
    store().hide();
    store().unregisterCollection(scopeId);
    expect(store()).toMatchObject({ open: false, expanded: false });
    store().registerCollection({ scopeId: nextScopeId, status: "loading", targets: [] });
    store().registerCollection({ scopeId: nextScopeId, status: "ready", targets: [nextTarget] });
    expect(store()).toMatchObject({ open: false, activeTarget: nextTarget });
    store().show();
    store().registerCollection({ scopeId: nextScopeId, status: "ready", targets: [nextTarget] });
    expect(store().open).toBe(true);
  });

  it("turns the sidebar off for a collection without details and back on for the next", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().unregisterCollection(scopeId);
    store().registerCollection({ scopeId: "inbox:items", status: "ready", targets: [], details: false });
    expect(store()).toMatchObject({ available: false, activeTarget: null, open: false });

    store().unregisterCollection("inbox:items");
    expect(store().available).toBe(false);

    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    expect(store()).toMatchObject({ available: true, activeTarget: firstTarget });
  });

  it("leaves expanded when the scope changes", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().expand();
    expect(store().expanded).toBe(true);

    store().unregisterCollection(scopeId);
    store().registerCollection({ scopeId: nextScopeId, status: "ready", targets: [nextTarget] });

    expect(store()).toMatchObject({ expanded: false, open: false });
  });

  it("consumes a matching pending target when its collection is ready", () => {
    store().requestTarget(secondTarget);
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });

    expect(store()).toMatchObject({ activeTarget: secondTarget, pendingTarget: null, open: true });
  });

  it("drops a missing pending target and selects the first available row", () => {
    store().requestTarget({ scopeId, entityId: "missing", entityKind: "service" });
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });

    expect(store()).toMatchObject({ activeTarget: firstTarget, pendingTarget: null });
  });

  it("does not reopen a dismissed pending navigation when registration completes", () => {
    store().requestTarget(firstTarget);
    store().hide();
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    expect(store()).toMatchObject({ open: false, activeTarget: firstTarget });
  });

  it("keeps a cross-scope pending target while the previous collection unregisters", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().requestTarget(nextTarget);

    store().unregisterCollection(scopeId);
    expect(store().pendingTarget).toEqual(nextTarget);

    store().registerCollection({ scopeId: nextScopeId, status: "ready", targets: [nextTarget] });
    expect(store()).toMatchObject({ activeTarget: nextTarget, pendingTarget: null });
  });

  it("preserves a valid active target when a collection refreshes", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });
    store().activateTarget(secondTarget);

    store().registerCollection({ scopeId, status: "loading", targets: [] });
    expect(store().activeTarget).toEqual(secondTarget);

    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });
    expect(store().activeTarget).toEqual(secondTarget);
  });

  it("shows a hidden sidebar when activating a target and keeps expanded", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });
    store().hide();

    store().activateTarget(secondTarget);
    expect(store()).toMatchObject({ open: true, activeTarget: secondTarget });

    store().expand();
    store().activateTarget(firstTarget);
    expect(store()).toMatchObject({ expanded: true, activeTarget: firstTarget });
  });

  it("starts document properties closed and resets visibility between documents", () => {
    for (const entityKind of ["verdict", "evidence", "card"]) {
      const target = { scopeId, entityId: entityKind, entityKind };
      store().activateTarget(target);
      expect(store()).toMatchObject({ activeTarget: target, open: false });
      store().show();
      expect(store().open).toBe(true);
    }
    store().activateTarget(firstTarget);
    expect(store()).toMatchObject({ activeTarget: firstTarget, open: true });
  });

  it("keeps properties closed when a document is opened through pending navigation", () => {
    const target = { scopeId: nextScopeId, entityId: "evidence-1", entityKind: "evidence" };
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().show();
    store().requestTarget(target);
    store().unregisterCollection(scopeId);
    store().registerCollection({ scopeId: nextScopeId, status: "ready", targets: [target] });
    expect(store()).toMatchObject({ activeTarget: target, pendingTarget: null, open: false });
  });

  it("clearTarget shows the empty state and a refresh keeps it empty", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });

    store().show();
    store().clearTarget(scopeId);
    expect(store()).toMatchObject({ activeTarget: null, open: true });

    store().registerCollection({ scopeId, status: "loading", targets: [] });
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });
    expect(store().activeTarget).toBeNull();
  });

  it("clearTarget ignores a different scope", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().clearTarget(nextScopeId);

    expect(store().activeTarget).toEqual(firstTarget);
  });

  it("starts with the empty state when a collection does not select first", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget], selectFirst: false });

    expect(store()).toMatchObject({ activeTarget: null, open: false, available: true });
  });

  it("clears the selection when a ready collection is empty", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().registerCollection({ scopeId, status: "ready", targets: [] });

    expect(store()).toMatchObject({ activeTarget: null, open: false });
  });

  it("keeps a same-scope target on error and drops a foreign one", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().registerCollection({ scopeId, status: "error", targets: [] });
    expect(store()).toMatchObject({ collectionStatus: "error", activeTarget: firstTarget });

    store().registerCollection({ scopeId: nextScopeId, status: "error", targets: [] });
    expect(store()).toMatchObject({ collectionStatus: "error", activeTarget: null });
  });

  it("closes and clears content when the active collection unregisters", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().unregisterCollection(nextScopeId);
    expect(store().activeTarget).toEqual(firstTarget);

    store().unregisterCollection(scopeId);
    expect(store()).toMatchObject({
      activeScope: null,
      activeTarget: null,
      collectionStatus: "idle",
      open: false,
      available: true,
    });
  });

  it("toggles visibility and expansion; hiding leaves expanded, expanding shows", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });

    store().show();
    store().toggle();
    expect(store().open).toBe(false);
    store().toggleExpanded();
    expect(store()).toMatchObject({ open: true, expanded: true });
    store().hide();
    expect(store()).toMatchObject({ open: false, expanded: false });
    store().show();
    expect(store()).toMatchObject({ open: true, expanded: false });
  });

  it("never expands a peek-only entity kind", () => {
    const fact: DetailTarget = { scopeId, entityId: "fact-1", entityKind: "fact" };
    store().registerCollection({ scopeId, status: "ready", targets: [fact] });
    store().activateTarget(fact);
    store().expand();
    expect(store()).toMatchObject({ open: true, expanded: false });
  });

  it("expands page-only and both kinds", () => {
    for (const entityKind of ["document", "card"]) {
      const target: DetailTarget = { scopeId, entityId: "x", entityKind };
      store().registerCollection({ scopeId, status: "ready", targets: [target] });
      store().activateTarget(target);
      store().expand();
      expect(store().expanded).toBe(true);
      store().restore();
    }
  });

  it("expands only with an active collection", () => {
    store().expand();
    expect(store().expanded).toBe(false);
  });


  it("reopens the last valid item after an outside canvas click clears visible selection", () => {
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });
    store().activateTarget(secondTarget);
    store().hide();
    store().clearTarget(scopeId);
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget, secondTarget] });
    expect(store()).toMatchObject({ open: false, activeTarget: null, lastTarget: secondTarget });
    store().show();
    expect(store().activeTarget).toEqual(secondTarget);
    store().hide();
    store().clearTarget(scopeId);
    store().registerCollection({ scopeId, status: "ready", targets: [firstTarget] });
    store().show();
    expect(store().activeTarget).toBeNull();
  });

  it("keeps sidebar geometry out of global state", () => {
    expect(store()).not.toHaveProperty("width");
    expect(store()).not.toHaveProperty("setSize");
  });
});
