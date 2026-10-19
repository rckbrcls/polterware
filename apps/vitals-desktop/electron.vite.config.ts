import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(rootDir, "../../packages");

export default defineConfig({
  main: {
    resolve: { preserveSymlinks: false },
    build: {
      outDir: "out/main",
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
    server: { port: 5175, strictPort: true },
    plugins: [
      solid({
        include: [
          `${resolve(rootDir, "src/renderer")}/**/*.{tsx,jsx}`,
          `${packagesDir}/frontend/**/*.{tsx,jsx}`,
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
        "@polterware/frontend-design-system": resolve(
          rootDir,
          "../../packages/frontend/design-system/src/index.ts",
        ),
      },
      preserveSymlinks: false,
    },
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "solid-js",
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
