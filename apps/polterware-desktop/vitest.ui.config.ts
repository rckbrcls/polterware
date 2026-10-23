import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    solid({
      include: [
        /packages[\\/](features|frontend)[\\/].*\.(tsx|jsx)$/,
        /apps[\\/]desktop[\\/]src[\\/]renderer[\\/].*\.(tsx|jsx)$/,
        /node_modules[\\/]\.pnpm[\\/].*@ark-ui\+solid@.*[\\/].*\.jsx$/,
        /node_modules[\\/]@ark-ui[\\/]solid[\\/].*\.jsx$/,
        /node_modules[\\/]\.pnpm[\\/].*@corvu\+.*[\\/].*\.jsx$/,
        /node_modules[\\/]@corvu[\\/].*\.jsx$/,
      ],
      extensions: [".tsx", ".jsx"],
    }),
  ],
  resolve: {
    conditions: ["solid", "browser", "development", "import", "module", "default"],
    dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
    alias: [
      { find: "solid-js/web", replacement: resolve(rootDir, "node_modules/solid-js/web") },
      { find: "solid-js/store", replacement: resolve(rootDir, "node_modules/solid-js/store") },
      { find: "solid-js", replacement: resolve(rootDir, "node_modules/solid-js") },
      {
        find: "@polterware/feature-shell",
        replacement: resolve(rootDir, "../../packages/features/shell/src/index.tsx"),
      },
      {
        find: "@polterware/feature-architecture/icons",
        replacement: resolve(rootDir, "../../packages/features/architecture/src/icons.ts"),
      },
      {
        find: "@polterware/feature-architecture",
        replacement: resolve(rootDir, "../../packages/features/architecture/src/index.tsx"),
      },
      {
        find: "@polterware/feature-settings/boot",
        replacement: resolve(rootDir, "../../packages/features/settings/src/boot.ts"),
      },
      {
        find: "@polterware/feature-settings",
        replacement: resolve(rootDir, "../../packages/features/settings/src/index.tsx"),
      },
      {
        find: "@polterware/feature-knowledge/change-envelope",
        replacement: resolve(rootDir, "../../packages/features/knowledge/src/change-envelope.ts"),
      },
      {
        find: "@polterware/feature-knowledge",
        replacement: resolve(rootDir, "../../packages/features/knowledge/src/index.tsx"),
      },
      {
        find: "@polterware/feature-integrations",
        replacement: resolve(rootDir, "../../packages/features/integrations/src/index.tsx"),
      },
      {
        find: "@polterware/feature-commander",
        replacement: resolve(rootDir, "../../packages/features/commander/src/index.tsx"),
      },
      {
        find: "@polterware/frontend-state",
        replacement: resolve(rootDir, "../../packages/frontend/state/src/index.ts"),
      },
      {
        find: "@polterware/frontend-design-system",
        replacement: resolve(rootDir, "../../packages/frontend/design-system/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "jsdom",
  },
  ssr: {
    noExternal: ["@ark-ui/solid", "@corvu/resizable", "@corvu/utils"],
  },
});
