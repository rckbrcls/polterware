import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Browser-only preview of the Polterware Notes renderer. No Electron, no core: `browser-dev-bridge.ts`
// installs a seeded in-memory `window.pwnotes`, so every surface can be inspected in a plain browser.
const rootDir = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(rootDir, "../../packages");
const notesFeatures = ["shell", "notes", "spaces", "schedule", "calendar", "attachments", "focus", "map", "settings", "search"] as const;
const notesFeatureAliases = Object.fromEntries(
  notesFeatures.map(name => [`@polterware/feature-notes-${name}`, resolve(packagesDir, `features/notes-${name}/src/index.tsx`)]),
);

export default defineConfig({
  root: resolve(rootDir, "src/renderer"),
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
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
      "@polterware/notes-contracts": resolve(packagesDir, "notes-contracts/src/index.ts"),
      "@polterware/feature-notes-shell/feature": resolve(packagesDir, "features/notes-shell/src/feature.ts"),
      ...notesFeatureAliases,
      "@polterware/frontend-design-system": resolve(packagesDir, "frontend/design-system/src/index.ts"),
      "@polterware/frontend-map": resolve(packagesDir, "frontend/map/src/index.ts"),
    },
    preserveSymlinks: false,
  },
  esbuild: { jsx: "automatic", jsxImportSource: "solid-js" },
  optimizeDeps: {
    include: ["solid-js", "solid-js/web", "solid-js/store"],
    exclude: ["@ark-ui/solid", "@corvu/resizable", "@corvu/utils"],
    esbuildOptions: { jsx: "automatic", jsxImportSource: "solid-js" },
  },
});
