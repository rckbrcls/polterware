import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(rootDir, "../../packages");

const notesFeatures = [
  "shell",
  "notes",
  "spaces",
  "schedule",
  "calendar",
  "attachments",
  "focus",
  "map",
  "settings",
  "search",
] as const;

const notesFeatureAliases = Object.fromEntries(
  notesFeatures.map((name) => [
    `@polterware/feature-notes-${name}`,
    resolve(rootDir, `../../packages/features/notes-${name}/src/index.tsx`),
  ]),
);

export default defineConfig({
  main: {
    resolve: {
      preserveSymlinks: false,
      alias: {
        "@polterware/notes-contracts": resolve(
          rootDir,
          "../../packages/notes-contracts/src/index.ts",
        ),
      },
    },
    build: {
      outDir: "out/main",
      externalizeDeps: {
        exclude: ["@polterware/notes-contracts"],
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
    server: { port: 5174, strictPort: true },
    plugins: [
      solid({
        include: [
          `${resolve(rootDir, "src/renderer")}/**/*.{tsx,jsx}`,
          `${packagesDir}/features/notes-*/**/*.{tsx,jsx}`,
          `${packagesDir}/frontend/**/*.{tsx,jsx}`,
          /packages[\\/]features[\\/]notes-[^\\/]+[\\/].*\.tsx$/,
          /packages[\\/]frontend[\\/].*\.tsx$/,
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
      conditions: ["solid", "browser", "development|production", "import", "module", "default"],
      alias: {
        "@": resolve(rootDir, "src/renderer"),
        "@polterware/notes-contracts": resolve(
          rootDir,
          "../../packages/notes-contracts/src/index.ts",
        ),
        "@polterware/feature-notes-shell/feature": resolve(
          rootDir,
          "../../packages/features/notes-shell/src/feature.ts",
        ),
        ...notesFeatureAliases,
        "@polterware/frontend-design-system": resolve(
          rootDir,
          "../../packages/frontend/design-system/src/index.ts",
        ),
        "@polterware/frontend-map": resolve(
          rootDir,
          "../../packages/frontend/map/src/index.ts",
        ),
      },
      preserveSymlinks: false,
    },
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "solid-js",
    },
    worker: {
      format: "es",
    },
    optimizeDeps: {
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
