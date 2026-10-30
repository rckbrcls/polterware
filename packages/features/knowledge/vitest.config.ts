import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

// Model tests run in node; component tests (.tsx) opt into jsdom with a file comment.
export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["development", "browser"] },
  test: {
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    server: { deps: { inline: [/solid-js/, /@ark-ui/, /@corvu/] } },
  },
});
