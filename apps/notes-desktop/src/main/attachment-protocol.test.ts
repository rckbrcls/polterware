import { mkdtemp, mkdir, writeFile, symlink, rm, realpath, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { attachmentResponse, resolveAttachmentUrl } from "./attachment-protocol.js";
const id = "01K6N3QWJ8P9A7B6C5D4E3F2G1";
describe("attachment protocol", () => {
  it("serves allowed previews, rejects active content and symlink escapes", async () => {
    const temp = await mkdtemp(join(tmpdir(), "notes-files-"));
    try {
      const root = join(temp, "attachments"); await mkdir(join(root, id), { recursive: true });
      const path = join(root, id, `${id}.png`); await writeFile(path, "image");
      const url = `pwnotes-file://attachment/${id}/${id}.png`;
      expect(await resolveAttachmentUrl(url, root)).toBe(await realpath(path));
      expect((await attachmentResponse(url, root)).headers.get("Content-Type")).toBe("image/png");
      await writeFile(join(root, id, `${id}.html`), "<script>bad()</script>");
      expect((await attachmentResponse(url.replace(".png", ".html"), root)).status).toBe(415);
      await writeFile(join(temp, "outside.png"), "private"); await rm(path); await symlink(join(temp, "outside.png"), path);
      expect((await attachmentResponse(url, root)).status).toBe(404);
      for (const raw of ["file:///etc/passwd", "pwnotes-file://attachment/../../etc/passwd", `pwnotes-file://attachment/${id}/%2Fetc%2Fpasswd`, url + "?x=1"]) {
        await expect(resolveAttachmentUrl(raw, root)).rejects.toThrow();
      }
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
});

it("rejects hard links and symlinks in both storage ancestors", async () => {
  const temp = await mkdtemp(join(tmpdir(), "notes-files-"));
  try {
    const root = join(temp, "attachments");
    const dir = join(root, id);
    await mkdir(dir, { recursive: true });
    const url = `pwnotes-file://attachment/${id}/${id}.png`;
    const outside = join(temp, "private.png");
    await writeFile(outside, "private");
    await link(outside, join(dir, `${id}.png`));
    expect((await attachmentResponse(url, root)).status).toBe(404);
    await rm(dir, { recursive: true });
    await symlink(temp, dir);
    await writeFile(join(temp, `${id}.png`), "private");
    expect((await attachmentResponse(url, root)).status).toBe(404);
    await rm(root, { recursive: true });
    await mkdir(join(temp, "external", id), { recursive: true });
    await writeFile(join(temp, "external", id, `${id}.png`), "private");
    await symlink(join(temp, "external"), root);
    expect((await attachmentResponse(url, root)).status).toBe(404);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

it("reads the opened descriptor when the path is swapped after validation", async () => {
  const temp = await mkdtemp(join(tmpdir(), "notes-files-"));
  try {
    const root = join(temp, "attachments");
    await mkdir(join(root, id), { recursive: true });
    const path = join(root, id, `${id}.png`);
    await writeFile(path, "safe preview");
    const outside = join(temp, "outside.png");
    await writeFile(outside, "private");
    const { FileHandle } = await import("node:fs/promises").then(async ({ open }) => {
      const handle = await open(path, "r");
      const prototype = Object.getPrototypeOf(handle) as { readFile: (...args: unknown[]) => Promise<Buffer> };
      await handle.close();
      return { FileHandle: prototype };
    });
    const original = FileHandle.readFile;
    const spy = vi.spyOn(FileHandle, "readFile").mockImplementation(async function (this: unknown, ...args: unknown[]) {
      await rm(path);
      await symlink(outside, path);
      return original.apply(this, args);
    });
    try {
      const response = await attachmentResponse(`pwnotes-file://attachment/${id}/${id}.png`, root);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("safe preview");
      expect(spy).toHaveBeenCalledOnce();
    } finally { spy.mockRestore(); }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

it.each(["wav", "webm"])("serves normalized %s audio previews", async (extension) => {
  const temp = await mkdtemp(join(tmpdir(), "notes-files-"));
  try {
    await mkdir(join(temp, id));
    await writeFile(join(temp, id, `${id}.${extension}`), "audio");
    const response = await attachmentResponse(`pwnotes-file://attachment/${id}/${id}.${extension}`, temp);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(`audio/${extension}`);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
