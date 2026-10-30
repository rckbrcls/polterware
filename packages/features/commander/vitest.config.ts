import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["development", "browser"] },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    server: { deps: { inline: [/solid-js/, /@ark-ui/, /@corvu/] } },
  },
});
