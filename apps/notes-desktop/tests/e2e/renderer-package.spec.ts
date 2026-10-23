import { test, expect } from "../fixtures";
import { createRequire } from "node:module";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Use the packager's installed ASAR implementation without adding a dependency.
const builderRequire = createRequire(createRequire(import.meta.url).resolve("electron-builder"));
const asarRequire = createRequire(builderRequire.resolve("app-builder-lib"));
const asar = asarRequire("@electron/asar") as {
  listPackage(path: string): string[];
  statFile(path: string, name: string): { unpacked?: boolean };
};

test("standard ASAR package serves unpacked renderer assets and denies private files", async ({ pwnotes, page }) => {
  const resources = join(dirname(process.env.PWNOTES_E2E_EXECUTABLE!), "..", "Resources");
  const archive = join(resources, "app.asar");
  const entries = asar.listPackage(archive).filter(name => name.startsWith("/out/renderer/"));
  expect(entries).toContain("/out/renderer/index.html");
  const assets = entries.filter(name => /\.(html|js|css|woff2|png|webp|svg|webm)$/.test(name));
  expect(assets.some(name => name.endsWith(".js"))).toBe(true);
  expect(assets.some(name => name.endsWith(".css"))).toBe(true);
  for (const name of assets) {
    expect(asar.statFile(archive, name.slice(1)).unpacked, name).toBe(true);
    expect((await stat(join(`${archive}.unpacked`, name))).isFile(), name).toBe(true);
  }
  await pwnotes.skipOnboarding();
  await expect(page.getByRole("main")).toBeVisible();
  const documentUrl = new URL(page.url());
  documentUrl.search = "";
  expect(documentUrl.href).toBe(pathToFileURL(join(archive, "out/renderer/index.html")).href);
  const html = await readFile(join(`${archive}.unpacked`, "out/renderer/index.html"), "utf8");
  const loaded = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]!);
  expect(loaded.some(name => name.endsWith(".js"))).toBe(true);
  expect(loaded.some(name => name.endsWith(".css"))).toBe(true);
  for (const asset of ["./index.html", ...loaded]) {
    const result = await page.evaluate(async asset => {
      const response = await fetch(new URL(asset, location.href));
      return { status: response.status, type: response.headers.get("Content-Type"), nosniff: response.headers.get("X-Content-Type-Options"), size: (await response.arrayBuffer()).byteLength };
    }, asset);
    expect(result.status, asset).toBe(200);
    expect(result.type).toBe(asset.endsWith(".js") ? "text/javascript" : asset.endsWith(".css") ? "text/css" : "text/html");
    expect(result.nosniff).toBe("nosniff");
    expect(result.size).toBeGreaterThan(0);
  }
  const sentinel = join(pwnotes.directory, "sentinel.js");
  await writeFile(sentinel, "throwaway-security-sentinel", { mode: 0o600 });
  for (const url of [pathToFileURL(sentinel).href, pathToFileURL(join(archive, "out/main/index.js")).href,
    pathToFileURL(join(`${archive}.unpacked`, "out/renderer/index.html")).href]) {
    expect(await page.evaluate(async url => (await fetch(url)).status, url)).toBe(404);
  }
});
