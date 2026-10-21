import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const sharedMaterialFiles = [
  "packages/configuration/tailwind/base.css",
  "packages/frontend/design-system/src/materials.css",
];

const directConsumerFiles = [
  "packages/frontend/design-system/src/button.css",
  "packages/frontend/design-system/src/status.css",
  "packages/frontend/design-system/src/tabs.css",
  "packages/frontend/shell/src/chrome.css",
];
const detailPanelFile = "packages/frontend/design-system/src/detail-panel.css";

const forbiddenInsetEdgeLight =
  /inset\s+0\s+(?:1px\s+0|0\s+0\s+1px)\s+var\(--(?:edge-light-(?:field|surface)-(?:highlight|rim)|texture-button-(?:highlight|edge|hover-highlight|hover-edge))\)/;
const forbiddenShadowEdgeLight =
  /(?:0\s+-1px\s+0|0\s+0\s+0\s+1px)\s+var\(--(?:edge-light-(?:field|surface)-(?:highlight|rim)|texture-button-(?:highlight|edge|hover-highlight|hover-edge))\)/;

function ruleBody(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing ${selector}`).not.toBeNull();
  return match?.[1].replace(/\s+/g, " ").trim();
}

function readWorkspaceFile(file: string) {
  return readFileSync(resolve(workspaceRoot, file), "utf8");
}

describe("edge-light policy", () => {
  it("uses real edge borders instead of inset or clipped outer shadows", () => {
    for (const file of [...sharedMaterialFiles, ...directConsumerFiles]) {
      const source = readWorkspaceFile(file);
      expect(source, file).not.toMatch(forbiddenInsetEdgeLight);
      expect(source, file).not.toMatch(forbiddenShadowEdgeLight);
    }
  });

  it("keeps the mirrored shared material recipes aligned", () => {
    const [base, materials] = sharedMaterialFiles.map((file) =>
      readWorkspaceFile(file),
    );
    const selectors = [
      ".edge-light-surface",
      ".edge-light-surface-top",
      ".surface-panel",
      ".surface-panel-float",
      ".control-field",
      ".menu-panel",
    ];

    for (const selector of selectors) {
      expect(ruleBody(base, selector), selector).toBe(
        ruleBody(materials, selector),
      );
    }
  });

  it("uses a crisp rim and top highlight at the component edge", () => {
    const materials = readWorkspaceFile(sharedMaterialFiles[1]);

    expect(ruleBody(materials, ".surface-panel")).toContain(
      "border: 1px solid var(--edge-light-surface-rim)",
    );
    expect(ruleBody(materials, ".surface-panel")).toContain(
      "border-top-color: var(--edge-light-surface-highlight)",
    );
    expect(ruleBody(materials, ".control-field")).toContain(
      "border: 1px solid var(--edge-light-field-rim)",
    );
  });

  it("keeps sidebar details opaque and preserves the reusable floating shell", () => {
    const detailPanel = readWorkspaceFile(detailPanelFile);
    expect(ruleBody(detailPanel, ".pw-detail-panel__frame")).toContain("background-color: var(--color-surface-raised)");
    const detailSource = readWorkspaceFile("packages/frontend/design-system/src/side-panel/side-panel.tsx");
    expect(detailSource).toContain("pw-detail-panel__frame surface-panel");
    const floatingWindow = readWorkspaceFile("packages/frontend/design-system/src/floating-window.css");
    const surface = ruleBody(floatingWindow, ".pw-floating-window__shell");

    expect(surface).toContain("transform-origin: top left");
    expect(surface).toContain("background-color: var(--color-surface-raised)");
    expect(surface).toContain("inset 0 1px 0 var(--edge-light-surface-highlight)");
    expect(surface).toContain("inset 0 0 0 1px var(--edge-light-surface-rim)");
    expect(surface).not.toContain("border-left");
  });
});
