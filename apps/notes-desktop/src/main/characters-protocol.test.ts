import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTER_NAMES, characterResponse, matchCharacterPath, resolveCharactersRoot } from "./characters-protocol.js";
import { contentSecurityPolicy } from "./navigation-policy.js";

describe("bundled characters", () => {
  it("allows only the named PNG and WebP files", () => {
    expect(CHARACTER_NAMES).toHaveLength(25);
    for (const name of CHARACTER_NAMES) expect(matchCharacterPath(`/characters/${name}`)).toBe(name);
    expect(matchCharacterPath("/characters/../me-streak-sad.png")).toBeNull();
    expect(matchCharacterPath("/characters/me-streak-sad.gif")).toBeNull();
    expect(matchCharacterPath("/tmp/characters/me-streak-sad.png")).toBeNull();
    expect(matchCharacterPath("/characters/me-streak-sad.png/extra")).toBeNull();
    expect(matchCharacterPath("/characters/")).toBeNull();
  });

  it("serves a regular character file and rejects a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "notes-characters-"));
    try {
      await writeFile(join(root, "me-streak-sad.png"), "image");
      const ok = await characterResponse("/characters/me-streak-sad.png", root);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("Content-Type")).toBe("image/png");
      expect(await ok.text()).toBe("image");
      await writeFile(join(root, "notes-character.webp"), "webp");
      expect((await characterResponse("/characters/notes-character.webp", root)).headers.get("Content-Type")).toBe("image/webp");
      await rm(join(root, "me-streak-sad.png"));
      await mkdir(join(root, "outside"));
      await writeFile(join(root, "outside", "me-streak-sad.png"), "secret");
      await symlink(join(root, "outside", "me-streak-sad.png"), join(root, "me-streak-sad.png"));
      expect((await characterResponse("/characters/me-streak-sad.png", root)).status).toBe(404);
      expect((await characterResponse("/characters/missing.png", root)).status).toBe(404);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("prefers extraResources in a packaged build and does not widen CSP", () => {
    const extra = join("/tmp/notes-resources", "characters");
    expect(resolveCharactersRoot("/tmp/app", "/tmp/notes-resources", true)).toBe(extra);
    expect(contentSecurityPolicy(false)).not.toContain("https://");
    expect(contentSecurityPolicy(false)).toContain("img-src 'self' data: blob: pwnotes-file:");
    expect(contentSecurityPolicy(false)).toContain("connect-src 'self'");
  });
});
