import { mkdtemp, mkdir, writeFile, symlink, link, rm, realpath, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { rendererFileResponse } from "./renderer-protocol";

describe("renderer file protocol", () => {
  it("maps only ASAR renderer URLs to physical unpacked assets and fails closed", async () => {
    const temp = await realpath(await mkdtemp(join(tmpdir(), "notes-renderer-asar-")));
    try {
      const root = join(temp, "app.asar", "out", "renderer");
      const physical = join(temp, "app.asar.unpacked", "out", "renderer");
      await mkdir(join(physical, "assets"), { recursive: true });
      await writeFile(join(temp, "app.asar"), "archive is not a directory");
      await writeFile(join(physical, "index.html"), "<html>Polterware Notes</html>");
      await writeFile(join(physical, "assets", "app.js"), "bundled");
      const response = (path: string) => rendererFileResponse(pathToFileURL(path).href, root);
      const html = await response(join(root, "index.html"));
      expect(await html.text()).toBe("<html>Polterware Notes</html>");
      expect(html.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(await (await response(join(root, "assets", "app.js"))).text()).toBe("bundled");
      // The physical sibling and other archive subtrees are not additional URL roots.
      expect((await response(join(physical, "index.html"))).status).toBe(404);
      expect((await response(join(root, "..", "main", "index.js"))).status).toBe(404);
      const secret = join(temp, "secret.js");
      await writeFile(secret, "private");
      await symlink(secret, join(physical, "assets", "secret.js"));
      await symlink(temp, join(physical, "escape"));
      await link(secret, join(physical, "assets", "linked.js"));
      for (const asset of ["assets/secret.js", "escape/secret.js", "assets/linked.js", "missing.js", "assets", "index.txt"]) {
        expect((await response(join(root, asset))).status).toBe(404);
      }
      await writeFile(join(physical, "index.txt"), "unsupported");
      expect((await response(join(root, "index.txt"))).status).toBe(404);
      await truncate(join(physical, "assets", "app.js"), 8 * 1024 * 1024 + 1);
      expect((await response(join(root, "assets", "app.js"))).status).toBe(404);
      await rm(physical, { recursive: true });
      expect((await response(join(root, "index.html"))).status).toBe(404);
      await writeFile(join(temp, "index.html"), "private");
      await symlink(temp, physical);
      expect((await response(join(root, "index.html"))).status).toBe(404);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });

  it("serves bundled assets and denies private files, symlinks and hard links", async () => {
    const temp = await realpath(await mkdtemp(join(tmpdir(), "notes-renderer-security-")));
    try {
      const root = join(temp, "renderer");
      await mkdir(join(root, "assets"), { recursive: true });
      await writeFile(join(root, "index.html"), "<html>Polterware Notes</html>");
      await writeFile(join(root, "assets", "app.js"), "console.log('app')");
      const secret = join(temp, "core.json");
      await writeFile(secret, "private");
      const response = (path: string) => rendererFileResponse(pathToFileURL(path).href, root);
      expect((await response(join(root, "index.html"))).status).toBe(200);
      expect((await response(join(root, "assets", "app.js"))).headers.get("Content-Type")).toBe("text/javascript");
      expect((await response(secret)).status).toBe(404);
      await symlink(secret, join(root, "assets", "secret.js"));
      expect((await response(join(root, "assets", "secret.js"))).status).toBe(404);
      await symlink(temp, join(root, "escape"));
      await writeFile(join(temp, "secret.js"), "private");
      expect((await response(join(root, "escape", "secret.js"))).status).toBe(404);
      await link(secret, join(root, "assets", "linked.js"));
      expect((await response(join(root, "assets", "linked.js"))).status).toBe(404);
      expect((await rendererFileResponse("file://evil/etc/passwd", root)).status).toBe(404);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
});
