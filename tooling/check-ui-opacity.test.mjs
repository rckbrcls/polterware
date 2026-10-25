import test from "node:test";
import assert from "node:assert/strict";
import { inspectSource } from "./check-ui-opacity.mjs";

const PRODUCT_FILE = "packages/features/example/src/example.tsx";
const BUTTON_FILE = "packages/frontend/design-system/src/button.css";
const WINDOW_FILE = "apps/polterware-desktop/src/main/window.ts";
const VITALS_WINDOW_FILE = "apps/vitals-desktop/src/main/window.ts";
const BOT_AVATAR_FILE = "packages/frontend/bot-avatars/src/draw.ts";
const MASK_FADE_FILE = "packages/frontend/design-system/src/markdown-editor.css";
const CANVAS_FILE =
  "packages/features/architecture/src/canvas/architecture-canvas-host.tsx";
const BASE_TOKENS_FILE = "packages/configuration/tailwind/base.css";
const MATERIALS_FILE = "packages/frontend/design-system/src/materials.css";
const DIALOG_MOTION_FILE = "packages/frontend/design-system/src/dialog.css";
const DETAIL_PANEL_FILE =
  "packages/frontend/design-system/src/detail-panel.css";

test("rejects alpha color syntaxes and element opacity", () => {
  const source = `
    .one { color: rgba(255, 255, 255, 0.4); }
    .two { color: rgb(255 255 255 / 0.4); }
    .three { color: #ffffff55; }
    .four { opacity: 0.5; }
    <div class="bg-black/40 opacity-70" />
    .five { background: color-mix(in oklch, red 20%, transparent); }
  `;

  assert.deepEqual(
    new Set(inspectSource(source, PRODUCT_FILE).map((issue) => issue.rule)),
    new Set([
      "alpha-hex",
      "element-opacity",
      "legacy-alpha-color",
      "modern-alpha-color",
      "tailwind-alpha-modifier",
      "transparent-color-mix",
    ]),
  );
});

test("allows opaque tokens and no-fill transparency", () => {
  const source = `
    .panel { background: var(--color-surface); color: #ececec; }
    .ghost { background: transparent; border-color: transparent; }
    <path fill="none" stroke="var(--color-border-default)" />
  `;

  assert.deepEqual(inspectSource(source, PRODUCT_FILE), []);
});

test("allows modern alpha only in shared border and effect tokens", () => {
  const baseSource = `
    :root {
      --color-border-subtle: rgb(255 255 255 / 0.4);
      --color-overlay: rgb(0 0 0 / 0.6);
      --color-shadow: rgb(0 0 0 / 0.32);
      --color-shell-glass: rgb(7 7 7 / 0.45);
      --color-sidebar-glass: var(--color-shell-glass);
    }
  `;
  const materialsSource =
    "--edge-light-surface-rim: rgb(255 255 255 / 0.028);";

  assert.deepEqual(inspectSource(baseSource, BASE_TOKENS_FILE), []);
  assert.deepEqual(inspectSource(materialsSource, MATERIALS_FILE), []);
  assert.notDeepEqual(inspectSource(baseSource, PRODUCT_FILE), []);
  assert.notDeepEqual(
    inspectSource("--color-overlay: rgba(0, 0, 0, 0.6);", BASE_TOKENS_FILE),
    [],
  );
});

test("rejects alpha text tokens even in the shared token file", () => {
  const source = "--color-text-muted: rgb(255 255 255 / 0.4);";

  assert.notDeepEqual(inspectSource(source, BASE_TOKENS_FILE), []);
});

test("allows element opacity only in centralized presence motion", () => {
  const source = `
    @keyframes enter {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  assert.deepEqual(inspectSource(source, DIALOG_MOTION_FILE), []);
  assert.notDeepEqual(inspectSource(source, PRODUCT_FILE), []);
});

test("allows only the DetailPanel decorative-layer opacity variables", () => {
  const scopedSource = `
    .surface::before { opacity: var(--detail-panel-chrome-alpha); }
    .surface::after { opacity: var(--detail-panel-fade-alpha); }
  `;

  assert.deepEqual(inspectSource(scopedSource, DETAIL_PANEL_FILE), []);
  assert.notDeepEqual(
    inspectSource(".content { opacity: 0.5; }", DETAIL_PANEL_FILE),
    [],
  );
});

test("contains material transparency inside Texture Button", () => {
  const source = `
    .texture-button-material {
      background: rgb(255 255 255 / 0.12);
      border-color: color-mix(in oklch, white 20%, transparent);
    }
  `;

  assert.deepEqual(inspectSource(source, BUTTON_FILE), []);
  assert.notDeepEqual(inspectSource(source, PRODUCT_FILE), []);
});

test("allows native Desktop window transparency (main vibrancy + Commander)", () => {
  const source = `transparent: true,\nbackgroundColor: "#00000000",`;

  assert.deepEqual(inspectSource(source, WINDOW_FILE), []);
  assert.notDeepEqual(inspectSource(source, PRODUCT_FILE), []);
});

test("allows the crisp opaque canvas grid but rejects transparent fades", () => {
  const grid =
    "radial-gradient(circle, var(--color-border-default) 1px, transparent 1px)";
  const fade = "linear-gradient(to bottom, var(--color-surface), transparent)";

  assert.deepEqual(inspectSource(grid, CANVAS_FILE), []);
  assert.notDeepEqual(inspectSource(fade, CANVAS_FILE), []);
});

test("allows only the named shared fade-edge material gradient", () => {
  const sharedBottomFade =
    "--material-fade-edge-bottom: linear-gradient(to bottom, color-mix(in srgb, var(--color-surface) 50%, transparent), transparent);";
  const sharedTopFade =
    "--material-fade-edge-top: linear-gradient(to top, color-mix(in srgb, var(--color-surface) 50%, transparent), transparent);";
  const sharedToolbarFill =
    "--material-fade-edge-toolbar-trail: linear-gradient(to bottom, var(--color-surface), transparent);";
  const sharedInlineStart =
    "--material-fade-edge-inline-start: linear-gradient(to right, transparent, #000 var(--inline-fade-start));";

  assert.deepEqual(inspectSource(sharedBottomFade, MATERIALS_FILE), []);
  assert.deepEqual(inspectSource(sharedTopFade, MATERIALS_FILE), []);
  assert.deepEqual(inspectSource(sharedToolbarFill, MATERIALS_FILE), []);
  assert.deepEqual(inspectSource(sharedInlineStart, MATERIALS_FILE), []);
  assert.notDeepEqual(inspectSource(sharedTopFade, PRODUCT_FILE), []);
  assert.notDeepEqual(
    inspectSource(
      "--other-fade: linear-gradient(to bottom, black, transparent);",
      MATERIALS_FILE,
    ),
    [],
  );
});

test("allows native Vitals window transparency for macOS vibrancy", () => {
  const source = `transparent: true,\nbackgroundColor: "#00000000",`;

  assert.deepEqual(inspectSource(source, VITALS_WINDOW_FILE), []);
});

test("allows canvas avatar art alpha blending in bot-avatars", () => {
  const source = `seg(a1, a0, 5, 'rgba(0,0,0,0.2)', 3.5);`;

  assert.deepEqual(inspectSource(source, BOT_AVATAR_FILE), []);
  assert.notDeepEqual(inspectSource(source, PRODUCT_FILE), []);
});

test("allows mask-image linear gradients with transparent stops on scrollers", () => {
  const maskSource = `mask-image: linear-gradient(to bottom, #000 28px, transparent);`;
  const bgSource = `background: linear-gradient(to bottom, #000 28px, transparent);`;

  assert.deepEqual(inspectSource(maskSource, MASK_FADE_FILE), []);
  assert.notDeepEqual(inspectSource(bgSource, MASK_FADE_FILE), []);
});

test("does not flag opaque gradients followed by transparent properties", () => {
  const source = `
    .row { background: linear-gradient(to bottom, #262626, #3b3b3b); }
    .btn { background: transparent; }
  `;

  assert.deepEqual(inspectSource(source, PRODUCT_FILE), []);
});
