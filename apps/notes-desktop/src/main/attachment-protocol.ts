import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { basename, dirname, resolve, extname } from "node:path";
import { ULID } from "./navigation-policy.js";

const mime: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".webm": "audio/webm" };

function attachmentParts(raw: string): string[] {
  const url = new URL(raw);
  if (url.protocol !== "pwnotes-file:" || url.hostname !== "attachment" || url.port || url.username || url.password || url.search || url.hash) throw new Error("Invalid attachment URL");
  const parts = url.pathname.slice(1).split("/").map(decodeURIComponent);
  if (parts.length !== 2 || !ULID.test(parts[0]!) || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}\.[a-zA-Z0-9]{1,10}$/.test(parts[1]!)) throw new Error("Invalid attachment identifiers");
  return parts;
}

// Darwin has no /proc fd traversal. O_NOFOLLOW_ANY rejects symlinks in every
// component atomically (sys/fcntl.h); Node exposes only O_NOFOLLOW's leaf flag.
const noFollowAny = process.platform === "darwin" ? 0x20000000 : 0;
async function openAttachment(raw: string, root: string): Promise<{ file: FileHandle; path: string }> {
  const parts = attachmentParts(raw);
  // Canonicalize the trusted data-directory parent, never the attachments root.
  const base = resolve(await realpath(dirname(root)), basename(root));
  const path = resolve(base, ...parts);
  const handles: FileHandle[] = [];
  try {
    if (process.platform !== "darwin" && process.platform !== "linux") throw new Error("Secure attachment open unavailable");
    let parent: FileHandle | undefined;
    for (const component of [base, parts[0]!]) {
      const target = parent && process.platform === "linux" ? `/proc/self/fd/${parent.fd}/${component}` : parent ? resolve(base, component) : component;
      if (!(await lstat(target)).isDirectory()) throw new Error("Invalid attachment ancestor");
      parent = await open(target, constants.O_RDONLY | constants.O_DIRECTORY | (noFollowAny || constants.O_NOFOLLOW));
      handles.push(parent);
    }
    const target = process.platform === "linux" ? `/proc/self/fd/${parent!.fd}/${parts[1]!}` : path;
    const file = await open(target, constants.O_RDONLY | (noFollowAny || constants.O_NOFOLLOW) | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink > 1) throw new Error("Invalid attachment file");
      return { file, path };
    } catch (error) { await file.close(); throw error; }
  } finally { await Promise.all(handles.map((handle) => handle.close())); }
}

export async function resolveAttachmentUrl(raw: string, root: string): Promise<string> {
  const { file, path } = await openAttachment(raw, root);
  await file.close();
  return path;
}
export async function attachmentResponse(raw: string, root: string): Promise<Response> {
  let file: FileHandle | undefined;
  try {
    const attachment = await openAttachment(raw, root);
    file = attachment.file;
    const type = mime[extname(attachment.path).toLowerCase()];
    if (!type) return new Response(null, { status: 415 });
    const data = new Uint8Array(await file.readFile());
    // A hard link created during the read must not expose bytes either.
    if ((await file.stat()).nlink > 1) throw new Error("Attachment link count changed");
    return new Response(data, { headers: { "Content-Type": type,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return new Response(null, { status: 404 }); }
  finally { await file?.close(); }
}
