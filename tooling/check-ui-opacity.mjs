#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = [
  "apps/web/src",
  "apps/polterware-desktop/src",
  "apps/notes-desktop/src",
  "apps/vitals-desktop/src",
  "packages/configuration",
  "packages/features",
  "packages/frontend",
];
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
]);
const SKIPPED_DIRECTORIES = new Set(["dist", "generated", "node_modules", "out"]);

const TEXTURE_BUTTON_PATH = "packages/frontend/design-system/src/button.css";
const DETAIL_PANEL_PATH =
  "packages/frontend/design-system/src/detail-panel.css";
const SHARED_MATERIALS_PATH =
  "packages/frontend/design-system/src/materials.css";
// Native Electron desktop windows use transparent under-window vibrancy chrome on macOS.
const DESKTOP_WINDOW_PATHS = new Set([
  "apps/polterware-desktop/src/main/window.ts",
  "apps/vitals-desktop/src/main/window.ts",
]);
// Procedural canvas avatar artwork renders 2D canvas shading, highlights, wear, and bake-in presence.
const CANVAS_AVATAR_PATHS = new Set([
  "packages/frontend/bot-avatars/src/BotAvatar.tsx",
  "packages/frontend/bot-avatars/src/color.ts",
  "packages/frontend/bot-avatars/src/draw.ts",
  "packages/frontend/bot-avatars/src/mesh.ts",
  "packages/frontend/bot-avatars/src/plastic.ts",
  "packages/frontend/bot-avatars/src/wear.ts",
]);
// Edge-fading containers and scrollers use CSS mask-image linear gradients with transparent stops on opaque content.
const MASK_FADE_PATHS = new Set([
  "apps/web/src/styles.css",
  "packages/features/notes-shell/src/shell.css",
  "packages/frontend/design-system/src/markdown-editor.css",
]);
const CANVAS_HOST_PATH =
  "packages/features/architecture/src/canvas/architecture-canvas-host.tsx";
const ALPHA_TOKEN_DECLARATIONS = new Map([
  [
    "packages/configuration/tailwind/base.css",
    /--(?:color-border-(?:subtle|default|strong)|color-overlay|color-shadow(?:-(?:subtle|float|outline))?|keycap-(?:sheen|face-edge|shadow)|color-(?:shell|sidebar)-glass|edge-light-(?:field|surface)-(?:highlight|rim))\s*:/,
  ],
  [
    "packages/frontend/design-system/src/materials.css",
    /--edge-light-(?:field|surface)-(?:highlight|rim)\s*:/,
  ],
]);
const DESKTOP_WINDOW_ALPHA_HEX = new Set(["#00000000"]);
const PRESENCE_MOTION_PATHS = new Set([
  "apps/polterware-desktop/src/renderer/boot-splash.css",
  "apps/notes-desktop/src/renderer/boot-splash.css",
  "apps/vitals-desktop/src/renderer/boot-splash.css",
  "packages/frontend/design-system/src/dialog.css",
  "packages/frontend/design-system/src/drawer.css",
  "packages/frontend/design-system/src/dropdown-menu.css",
  "packages/frontend/design-system/src/markdown-editor.css",
  "packages/frontend/design-system/src/navigation-menu.css",
  "packages/frontend/design-system/src/popover.css",
  "packages/frontend/design-system/src/template-card.css",
  "packages/frontend/design-system/src/toast.css",
  "packages/features/architecture/src/atlas-tree.css",
]);
// Shared JS motion primitives fade moving highlights and indicators through Motion values.
const MOTION_VALUE_PATHS = new Set([
  "packages/frontend/design-system/src/fluid-hover.tsx",
  "packages/frontend/design-system/src/popup-motion.ts",
  "packages/frontend/design-system/src/icon-swap.tsx",
  "packages/frontend/design-system/src/placement-motion.ts",
  "packages/features/architecture/src/canvas/atlas-card-frame.tsx",
  // Marketing page sections fade in once on scroll and the hero fades out as the page moves on.
  "apps/web/src/components/scroll-motion.ts",
]);
const OPAQUE_GRID_PATTERN =
  "radial-gradient(circle, var(--color-border-default) 1px, transparent 1px)";

const RULES = [
  {
    id: "element-opacity",
    pattern: /(?:\bopacity\s*:|\b(?:fill-opacity|stroke-opacity)\s*[=:]|\bopacity-(?:\[[^\]]+\]|\d+)\b)/gi,
  },
  {
    id: "legacy-alpha-color",
    pattern: /\b(?:rgba|hsla)\s*\(/gi,
  },
  {
    id: "modern-alpha-color",
    pattern: /\b(?:rgb|hsl|oklch|oklab|lab|lch)\s*\([^)]*\//gis,
  },
  {
    id: "alpha-hex",
    pattern: /#[0-9a-f]{8}(?![0-9a-f])|#[0-9a-f]{4}(?![0-9a-f])/gi,
  },
  {
    id: "tailwind-alpha-modifier",
    pattern:
      /\b(?:bg|text|border|fill|stroke|outline|ring|shadow)-(?:\[[^\]\s]+\]|[a-z0-9-]+)\/(?:\[[^\]]+\]|\d+)\b/gi,
  },
  {
    id: "transparent-color-mix",
    pattern: /color-mix\([^;{}]{0,500}?transparent[^;{}]{0,500}?\)/gi,
  },
  {
    id: "transparent-gradient",
    pattern: /(?:linear|radial|conic)-gradient\([^;{}]{0,500}?transparent[^;{}]{0,500}?\)/gi,
  },
  {
    id: "transparent-window",
    pattern: /\btransparent\s*:\s*true\b/gi,
  },
];

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function lineTextAt(source, index) {
  const start = source.lastIndexOf("\n", index - 1) + 1;
  const end = source.indexOf("\n", index);
  return source.slice(start, end === -1 ? source.length : end).trim();
}

function isAllowed(relativePath, ruleId, match, excerpt) {
  if (ruleId === "modern-alpha-color") {
    const declarationPattern = ALPHA_TOKEN_DECLARATIONS.get(relativePath);
    if (declarationPattern?.test(excerpt)) return true;
  }

  if (
    (PRESENCE_MOTION_PATHS.has(relativePath) || MOTION_VALUE_PATHS.has(relativePath))
    && ruleId === "element-opacity"
  ) {
    return true;
  }

  if (
    relativePath === DETAIL_PANEL_PATH
    && ruleId === "element-opacity"
    && /opacity:\s*var\(--detail-panel-(?:chrome|fade|title-chrome)-alpha\)/.test(excerpt)
  ) {
    return true;
  }

  if (
    relativePath === SHARED_MATERIALS_PATH
    && (ruleId === "transparent-gradient" || ruleId === "transparent-color-mix")
    && /--material-fade-edge-(?:bottom|top|toolbar-trail|mask|inline-mask|inline-start)/.test(excerpt)
  ) {
    return true;
  }

  if (relativePath === TEXTURE_BUTTON_PATH) {
    return ruleId !== "element-opacity" && ruleId !== "transparent-window";
  }

  if (
    DESKTOP_WINDOW_PATHS.has(relativePath) &&
    ((ruleId === "alpha-hex" && DESKTOP_WINDOW_ALPHA_HEX.has(match.toLowerCase())) ||
      ruleId === "transparent-window")
  ) {
    return true;
  }

  if (
    CANVAS_AVATAR_PATHS.has(relativePath) &&
    (ruleId === "legacy-alpha-color" ||
      ruleId === "modern-alpha-color" ||
      ruleId === "element-opacity")
  ) {
    return true;
  }

  if (
    MASK_FADE_PATHS.has(relativePath) &&
    ruleId === "transparent-gradient" &&
    /(?:-webkit-)?mask-image\s*:/.test(excerpt)
  ) {
    return true;
  }

  return (
    relativePath === CANVAS_HOST_PATH &&
    ruleId === "transparent-gradient" &&
    match.includes(OPAQUE_GRID_PATTERN)
  );
}

export function inspectSource(source, relativePath) {
  const issues = [];

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      const value = match[0];
      const index = match.index ?? 0;
      const excerpt = lineTextAt(source, index);
      if (isAllowed(relativePath, rule.id, value, excerpt)) continue;
      issues.push({
        rule: rule.id,
        line: lineNumberAt(source, index),
        excerpt,
      });
    }
  }

  return issues.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

export async function inspectProductSources() {
  const files = (
    await Promise.all(SOURCE_ROOTS.map((sourceRoot) => collectFiles(path.join(ROOT, sourceRoot))))
  )
    .flat()
    .sort();
  const issues = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(ROOT, absolutePath).split(path.sep).join("/");
    const source = await readFile(absolutePath, "utf8");
    for (const issue of inspectSource(source, relativePath)) {
      issues.push({ relativePath, ...issue });
    }
  }

  return issues;
}

async function main() {
  const issues = await inspectProductSources();
  if (issues.length === 0) {
    console.log("ui opacity check OK");
    return;
  }

  for (const issue of issues) {
    console.error(
      `${issue.relativePath}:${issue.line} [${issue.rule}] ${issue.excerpt}`,
    );
  }
  console.error(`ui opacity check failed with ${issues.length} issue(s)`);
  process.exitCode = 1;
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) {
  await main();
}
