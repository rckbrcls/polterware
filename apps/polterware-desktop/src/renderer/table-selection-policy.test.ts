// @vitest-environment node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// This file lives at apps/polterware-desktop/src/renderer, so the repository root is four levels up.
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const at = (path: string) => join(repoRoot, path);

/** Every .tsx under packages/features/<feature>/src that uses the shared DataTable. */
function tableConsumers(): string[] {
  const featuresDir = at("packages/features");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx") && readFileSync(path, "utf8").includes("DataTable")) {
        found.push(path);
      }
    }
  };
  for (const feature of readdirSync(featuresDir)) {
    const src = join(featuresDir, feature, "src");
    if (existsSync(src)) walk(src);
  }
  return found;
}

const REMOVED_SELECTION_ACTIONS = [
  "packages/features/knowledge/src/selection-actions.ts",
  "packages/features/knowledge/src/selection-actions.test.ts",
  "packages/features/operations/src/selection-actions.ts",
  "packages/features/operations/src/selection-actions.test.ts",
  "packages/features/shell/src/selection-actions.ts",
  "packages/features/shell/src/selection-actions.test.ts",
];

const BULK_SELECTION_SURFACES = [
  "packages/features/knowledge/src/work-list-table.tsx",
  "packages/features/shell/src/inbox-page.tsx",
];

describe("product table selection policy", () => {
  it("finds the product table consumers it is meant to police", () => {
    // Guards the discovery itself: a broken walk would make the next test vacuous.
    expect(tableConsumers().length).toBeGreaterThan(0);
  });

  it("keeps checkbox selection and selection toolbars to the Inbox and the Work list", () => {
    const selecting: string[] = [];
    for (const file of tableConsumers()) {
      const source = readFileSync(file, "utf8");
      if (!/DataTable\.(?:SelectionCell|SelectionToolbar)|\bselectionMode=/.test(source)) continue;
      selecting.push(file.slice(repoRoot.length));
    }
    // A batch makes sense only where people triage many rows; it is one write under one justification.
    expect(selecting.sort()).toEqual(BULK_SELECTION_SURFACES);
  });

  it("does not host a product-level selection toolbar", () => {
    const source = readFileSync(at("packages/features/shell/src/main-surface.tsx"), "utf8");
    expect(source).not.toContain("DataTableSelectionToolbarHost");
  });

  it("removes feature-specific batch selection action helpers", () => {
    for (const file of REMOVED_SELECTION_ACTIONS) {
      expect(existsSync(at(file)), file).toBe(false);
    }
  });

  it("uses fill-only active and focus states without a left edge accent", () => {
    const css = readFileSync(at("packages/frontend/design-system/src/table.css"), "utf8");
    expect(css).not.toContain("inset 2px 0 0");
    // Focus and activation light the row through the shared fill highlight, not an outline.
    expect(css).toMatch(/\.pw-data-table-row:focus-visible\s*{\s*outline: none;/);
    expect(css).toMatch(/\.pw-data-table-active\s*{[^}]*background: var\(--color-surface-raised\)/);
  });
});
