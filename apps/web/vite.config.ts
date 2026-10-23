import { copyFile, lstat, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
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
      // Vite copies the public/install.sh symlink as a symlink into the repo, which static
      // hosts drop. Replace it with the real script so the output stands on its own.
      compiled: async nitro => {
        const file = join(nitro.options.output.publicDir, "install.sh");
        if (!(await lstat(file)).isSymbolicLink()) return;
        const source = await realpath(file);
        await unlink(file);
        await copyFile(source, file);
      },
    },
    prerender: { routes: ["/", "/vitals", "/404"], crawlLinks: true, failOnError: true },
  })],
  resolve: { dedupe: ["solid-js"] },
});
