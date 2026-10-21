import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NODE_DETAIL_FIXTURES, fixtureNodeDetail } from "./fixtures";
import {
  architectureLifecycleLabel,
  architectureLifecycleTone,
  architectureLinkResourceCaption,
  architectureLinkStatusLabel,
  architectureLinkStatusTone,
  connectionEvidenceLabel,
  connectionEvidenceTone,
  hasConnectedNodes,
  provenConnectionCount,
  unprovenConnectionCount,
} from "./node-detail-helpers";

const root = dirname(fileURLToPath(import.meta.url));
const detailSource = readFileSync(resolve(root, "node-detail.tsx"), "utf8");
const indexSource = readFileSync(resolve(root, "index.tsx"), "utf8");

describe("architecture node detail helpers", () => {
  it("maps lifecycle labels and tones honestly (planned/linked are not healthy)", () => {
    expect(architectureLifecycleLabel("observed")).toBe("Observed");
    expect(architectureLifecycleLabel("Observed")).toBe("Observed");
    expect(architectureLifecycleLabel("planned")).toBe("Planned");
    expect(architectureLifecycleTone("observed")).toBe("healthy");
    expect(architectureLifecycleTone("planned")).toBe("muted");
    expect(architectureLifecycleTone("linked")).toBe("ok");
    expect(architectureLifecycleTone("unreachable")).toBe("down");
    expect(architectureLifecycleTone("drifted")).toBe("degraded");
    expect(architectureLifecycleTone(undefined)).toBe("unknown");
  });

  it("maps link status labels, tones, and resource captions", () => {
    expect(architectureLinkStatusLabel("linked")).toBe("Linked");
    expect(architectureLinkStatusLabel("unlinked")).toBe("Unlinked");
    expect(architectureLinkStatusTone("partial")).toBe("warn");
    expect(architectureLinkStatusTone("unlinked")).toBe("muted");
    expect(architectureLinkResourceCaption("linked", "payment-service")).toBe(
      "payment-service",
    );
    expect(architectureLinkResourceCaption("unlinked", "payment-service")).toBeUndefined();
    expect(architectureLinkResourceCaption("linked", null)).toBeUndefined();
  });

  it("maps connection evidence to Proven/Unproven chips", () => {
    expect(connectionEvidenceLabel(true)).toBe("Proven");
    expect(connectionEvidenceLabel(false)).toBe("Unproven");
    expect(connectionEvidenceTone(true)).toBe("healthy");
    expect(connectionEvidenceTone(false)).toBe("warn");
  });

  it("counts proven/unproven connections", () => {
    const pay = NODE_DETAIL_FIXTURES["n-pay"]!;
    expect(hasConnectedNodes(pay.connected)).toBe(true);
    expect(provenConnectionCount(pay.connected)).toBeGreaterThan(0);
    expect(unprovenConnectionCount(pay.connected)).toBeGreaterThan(0);
    expect(hasConnectedNodes([])).toBe(false);
    expect(provenConnectionCount([])).toBe(0);
  });
});

describe("ArchitectureNodeDetail composition contract", () => {
  it("uses the record layout with header status chips on ≥2 axes", () => {
    expect(detailSource).toContain("DetailPanel.Main");
    expect(detailSource).toContain("DetailPanel.Rail");
    expect(detailSource).toContain("DetailPanel.Property");
    expect(detailSource).not.toContain("DetailPanel.Metric");
    expect(detailSource).not.toContain("actions={");
    expect(detailSource).not.toMatch(/DetailPanel\.Action\b/);
    expect(detailSource).toContain("StatusChip");
    expect(detailSource).toContain("architectureLifecycleLabel");
    expect(detailSource).toContain("architectureLinkStatusLabel");
    expect(detailSource).toContain("connectionEvidenceTone");
    expect(detailSource).toContain("connectionEvidenceLabel");
    expect(detailSource).not.toContain("architectureLifecycleTone");
    expect(detailSource).not.toContain("architectureLinkStatusTone");
    // Evidence must not be presented as raw string alone without StatusChip
    expect(detailSource).not.toMatch(
      /DataTable\.Cell>\{\s*connection\.evidence\s*\?\s*"Proven"\s*:\s*"Unproven"\s*\}/,
    );
    expect(detailSource).not.toContain('>{connection.evidence ? "Proven" : "Unproven"}<');
  });

  it("preserves header domain icon and Open on canvas / Link resource actions", () => {
    expect(detailSource).toContain("NodeIcon");
    expect(detailSource).toMatch(/aside=\{[\s\S]*?>Open on canvas<\/Button>/);
    expect(detailSource).toContain(">Link resource</Button>");
    expect(detailSource).toContain("canLinkResource");
    expect(detailSource).toContain("onOpenOnCanvas");
    expect(detailSource).toContain("onLinkResource");
  });

  it("keeps loading, not-found, error, connected/docs empty honesty", () => {
    expect(detailSource).toContain("PageLoading");
    expect(detailSource).toContain('layout="detail"');
    expect(detailSource).toContain("PageError");
    expect(detailSource).toContain("Node not found");
    expect(detailSource).toContain("No connections listed.");
    expect(detailSource).toContain('aria-label="Connected architecture"');
    expect(detailSource).toMatch(/title="Linked docs"[\s\S]*?DetailPanel\.LinkedEntities/);
    expect(detailSource).not.toContain("Architecture node activity");
    expect(detailSource).not.toMatch(/PrimaryCell[^>]*description=/);
  });
});

describe("Architecture host wiring (Canvas + Views)", () => {
  it("mounts ArchitectureNodeDetail and keeps ArchitectureViewDetail exported", () => {
    expect(indexSource).toContain("<ArchitectureNodeDetail");
    expect(indexSource).toContain('export { ArchitectureViewDetail } from "./view-detail"');
    expect(indexSource).not.toContain("architecture:components");
    expect(indexSource).toContain("architecture:canvas");
    expect(indexSource).toContain('entityKind: "arch-node"');
    expect(indexSource).toContain("onOpenOnCanvas");
    expect(indexSource).toContain("onLinkResource");
  });
});

describe("NODE_DETAIL_FIXTURES detail contract", () => {
  it("ships a rich linked observed node with mixed evidence", () => {
    const pay = NODE_DETAIL_FIXTURES["n-pay"]!;
    expect(pay.lifecycle).toMatch(/observed/i);
    expect(pay.linkStatus).toBe("linked");
    expect(pay.resourceName).toBeTruthy();
    expect(pay.canLinkResource).toBe(false);
    expect(pay.connected.length).toBeGreaterThan(1);
    expect(pay.connected.some((c) => c.evidence)).toBe(true);
    expect(pay.connected.some((c) => !c.evidence)).toBe(true);
    expect(pay.environment).toBeTruthy();
    expect(pay.role).toBeTruthy();
    expect(pay.runtime).toBeTruthy();
    expect(pay.owner).toBeTruthy();
    expect(pay.dataSource).toBe("fixture");
  });

  it("ships an unlinked planned node for Link resource gating", () => {
    const planned = NODE_DETAIL_FIXTURES["n-planned"]!;
    expect(planned.lifecycle).toMatch(/planned/i);
    expect(planned.linkStatus).toBe("unlinked");
    expect(planned.canLinkResource).toBe(true);
    expect(planned.connected).toEqual([]);
  });

  it("sparse fixture fallback stays honest", () => {
    const sparse = fixtureNodeDetail("n-unknown-sparse");
    expect(sparse.linkStatus).toBe("unlinked");
    expect(sparse.connected).toEqual([]);
    expect(sparse.dataSource).toBe("fixture");
  });
});
