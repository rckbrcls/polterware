import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchSoundPath, resolveSoundsRoot, SOUND_NAMES, soundResponse } from "./sounds-protocol.js";
import { contentSecurityPolicy } from "./navigation-policy.js";

describe("bundled sounds", () => {
  it("allows only the eight named WebM files", () => {
    for (const name of SOUND_NAMES) expect(matchSoundPath(`/sounds/${name}.webm`)).toBe(`${name}.webm`);
    expect(matchSoundPath("/sounds/../bell.webm")).toBeNull();
    expect(matchSoundPath("/sounds/bell.wav")).toBeNull();
    expect(matchSoundPath("/tmp/sounds/bell.webm")).toBeNull();
    expect(matchSoundPath("/sounds/bell.webm/extra")).toBeNull();
  });

  it("serves a regular sound file and rejects a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "notes-sounds-"));
    try {
      await writeFile(join(root, "bell.webm"), "audio");
      const ok = await soundResponse("/sounds/bell.webm", root);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("Content-Type")).toBe("audio/webm");
      expect(await ok.text()).toBe("audio");
      await rm(join(root, "bell.webm"));
      await mkdir(join(root, "outside"));
      await writeFile(join(root, "outside", "bell.webm"), "secret");
      await symlink(join(root, "outside", "bell.webm"), join(root, "bell.webm"));
      expect((await soundResponse("/sounds/bell.webm", root)).status).toBe(404);
      expect((await soundResponse("/sounds/missing.webm", root)).status).toBe(404);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("prefers extraResources in a packaged build and does not widen CSP", () => {
    const extra = join("/tmp/notes-resources", "sounds");
    expect(resolveSoundsRoot("/tmp/app", "/tmp/notes-resources", true)).toBe(extra);
    expect(contentSecurityPolicy(false)).not.toContain("https://");
    expect(contentSecurityPolicy(false)).toContain("media-src 'self' blob: pwnotes-file:");
    expect(contentSecurityPolicy(false)).toContain("connect-src 'self'");
  });
});
