import { constants } from "node:fs";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".webm": "audio/webm" };
const noFollowAny = process.platform === "darwin" ? 0x20000000 : 0;

/** file:// is limited to shipped renderer assets; it must never expose user data. */
export async function rendererFileResponse(raw: string, root: string): Promise<Response> {
  const handles: FileHandle[] = [];
  try {
    const url = new URL(raw);
    if (url.protocol !== "file:" || url.host || !isAbsolute(root)) throw new Error("Invalid renderer asset");
    // Only the shipped renderer subtree is unpacked; URLs retain their ASAR origin.
    // Never open virtual ASAR directories or fall back to arbitrary file reads.
    const archiveSuffix = `${sep}app.asar${sep}out${sep}renderer`;
    const archived = root.endsWith(archiveSuffix);
    const physicalRoot = archived ? root.slice(0, -archiveSuffix.length) + `${sep}app.asar.unpacked${sep}out${sep}renderer` : root;
    const base = await realpath(physicalRoot);
    if (archived && base !== physicalRoot) throw new Error("Symlinked renderer root");
    const rel = relative(archived ? root : base, fileURLToPath(url));
    if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Invalid renderer asset");
    const path = resolve(base, rel);
    const type = types[extname(path)];
    if (!type) throw new Error("Unsupported renderer asset");
    if (process.platform !== "darwin" && process.platform !== "linux") throw new Error("Secure asset open unavailable");
    let parent = await open(base, constants.O_RDONLY | constants.O_DIRECTORY | (noFollowAny || constants.O_NOFOLLOW));
    handles.push(parent);
    const parts = rel.split(sep);
    for (const component of parts.slice(0, -1)) {
      const target = process.platform === "linux" ? `/proc/self/fd/${parent.fd}/${component}` : resolve(base, ...parts.slice(0, handles.length));
      parent = await open(target, constants.O_RDONLY | constants.O_DIRECTORY | (noFollowAny || constants.O_NOFOLLOW));
      handles.push(parent);
    }
    const target = process.platform === "linux" ? `/proc/self/fd/${parent.fd}/${parts.at(-1)}` : path;
    const file = await open(target, constants.O_RDONLY | constants.O_NONBLOCK | (noFollowAny || constants.O_NOFOLLOW));
    handles.push(file);
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > 8 * 1024 * 1024) throw new Error("Invalid renderer asset");
    const data = new Uint8Array(await file.readFile());
    if ((await file.stat()).nlink !== 1) throw new Error("Renderer asset changed");
    return new Response(data, { headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
  finally { await Promise.all(handles.map(handle => handle.close())); }
}
