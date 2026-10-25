import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(rootDir, "../../packages");

/**
 * Solid monorepo + packages that publish Solid JSX/TSX
 * (@ark-ui/solid) MUST be run through
 * vite-plugin-solid. Otherwise Rollup hits: `"jsx" is not exported by solid-js`
 * → blank/black Electron window.
 */
export default defineConfig({
  main: {
    resolve: {
      preserveSymlinks: false,
      alias: {
        "@polterware/contracts": resolve(rootDir, "../../packages/contracts/src/index.ts"),
      },
    },
    build: {
      outDir: "out/main",
      // Workspace contracts ship TypeScript with `.js` specifiers; bundle them
      // so Electron does not try to load missing generated `.js` files.
      externalizeDeps: {
        exclude: ["@polterware/contracts"],
      },
      rollupOptions: {
        input: { index: resolve(rootDir, "src/main/index.ts") },
      },
    },
  },
  preload: {
    resolve: { preserveSymlinks: false },
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: { index: resolve(rootDir, "src/preload/index.ts") },
        output: { entryFileNames: "[name].cjs", format: "cjs" },
      },
    },
  },
  renderer: {
    root: resolve(rootDir, "src/renderer"),
    server: { port: 5173, strictPort: true },
    plugins: [
      solid({
        include: [
          // App + monorepo sources
          `${resolve(rootDir, "src/renderer")}/**/*.{tsx,jsx}`,
          `${packagesDir}/features/**/*.{tsx,jsx}`,
          `${packagesDir}/frontend/**/*.{tsx,jsx}`,
          /packages[\\/](features|frontend)[\\/].*\.tsx$/,
          /apps[\\/]desktop[\\/]src[\\/]renderer[\\/].*\.tsx$/,
          // Packages that ship untransformed Solid JSX (solid export condition)
          /node_modules[\\/]\.pnpm[\\/].*@ark-ui\+solid@.*[\\/].*\.jsx$/,
          /node_modules[\\/]@ark-ui[\\/]solid[\\/].*\.jsx$/,
          /node_modules[\\/]\.pnpm[\\/].*@corvu\+.*[\\/].*\.jsx$/,
          /node_modules[\\/]@corvu[\\/].*\.jsx$/,
        ],
        extensions: [".tsx", ".jsx"],
      }),
      tailwindcss(),
    ],
    resolve: {
      dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
      conditions: ["solid", "browser", "development", "import", "module", "default"],
      alias: {
        "@": resolve(rootDir, "src/renderer"),
        "@polterware/contracts": resolve(rootDir, "../../packages/contracts/src/index.ts"),
        // Subpaths before package root alias so Vite does not treat them as file suffixes.
        "@polterware/feature-canvas/model": resolve(rootDir, "../../packages/features/canvas/src/model.ts"),
        "@polterware/feature-canvas/promotion": resolve(rootDir, "../../packages/features/canvas/src/promotion.ts"),
        "@polterware/feature-canvas": resolve(rootDir, "../../packages/features/canvas/src/index.tsx"),
        "@polterware/feature-shell": resolve(rootDir, "../../packages/features/shell/src/index.tsx"),
        // Subpath before package root alias so Vite does not treat /icons as a file suffix.
        "@polterware/feature-architecture/icons": resolve(
          rootDir,
          "../../packages/features/architecture/src/icons.ts",
        ),
        "@polterware/feature-architecture": resolve(
          rootDir,
          "../../packages/features/architecture/src/index.tsx",
        ),
        // Subpaths before package roots so Vite does not treat them as file suffixes.
        "@polterware/feature-knowledge/change-envelope": resolve(
          rootDir,
          "../../packages/features/knowledge/src/change-envelope.ts",
        ),
        "@polterware/feature-knowledge": resolve(
          rootDir,
          "../../packages/features/knowledge/src/index.tsx",
        ),
        "@polterware/feature-settings/boot": resolve(
          rootDir,
          "../../packages/features/settings/src/boot.ts",
        ),
        "@polterware/feature-settings": resolve(
          rootDir,
          "../../packages/features/settings/src/index.tsx",
        ),
        "@polterware/feature-commander": resolve(
          rootDir,
          "../../packages/features/commander/src/index.tsx",
        ),
        "@polterware/feature-integrations": resolve(
          rootDir,
          "../../packages/features/integrations/src/index.tsx",
        ),
        "@polterware/frontend-design-system": resolve(
          rootDir,
          "../../packages/frontend/design-system/src/index.ts",
        ),
        "@polterware/frontend-canvas": resolve(
          rootDir,
          "../../packages/frontend/canvas/src/index.ts",
        ),
      },
      preserveSymlinks: false,
    },
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "solid-js",
    },
    optimizeDeps: {
      // Prefer prebundling solid-js only; let solid-plugin transform solid JSX packages.
      include: ["solid-js", "solid-js/web", "solid-js/store"],
      exclude: ["@ark-ui/solid", "@corvu/resizable", "@corvu/utils"],
      esbuildOptions: {
        jsx: "automatic",
        jsxImportSource: "solid-js",
      },
    },
    ssr: {
      noExternal: ["@ark-ui/solid", "@corvu/resizable", "@corvu/utils"],
    },
    build: {
      outDir: resolve(rootDir, "out/renderer"),
      emptyOutDir: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        input: {
          index: resolve(rootDir, "src/renderer/index.html"),
        },
      },
    },
  },
});
