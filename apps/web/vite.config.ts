import { defineConfig } from "vite";
import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solidStart({ devOverlay: false }), tailwindcss(), nitro({
    preset: "static",
    hooks: {
      "prerender:generate": route => {
        if (route.route === "/404") route.fileName = "404.html";
      },
    },
    prerender: { routes: ["/", "/404"], crawlLinks: true, failOnError: true },
  })],
  resolve: { dedupe: ["solid-js"] },
});
