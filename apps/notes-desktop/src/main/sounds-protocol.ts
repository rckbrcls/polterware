import { constants, existsSync, lstatSync, realpathSync } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";

export const SOUND_NAMES = ["bell", "chime", "end", "glass", "pause", "ping", "pop", "start"] as const;
const SOUND_PATH = /^\/sounds\/(bell|chime|end|glass|pause|ping|pop|start)\.webm$/;

export function matchSoundPath(pathname: string): string | null {
  const match = SOUND_PATH.exec(pathname);
  return match ? `${match[1]}.webm` : null;
}

export function resolveSoundsRoot(appPath: string, resourcesPath: string, packaged: boolean): string {
  const extra = join(resourcesPath, "sounds");
  const resources = join(appPath, "resources/sounds");
  const published = join(appPath, "out/renderer/sounds");
  const publicCopy = join(appPath, "src/renderer/public/sounds");
  const candidates = packaged ? [extra, published] : [resources, publicCopy, published, extra];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]!;
}

export async function soundResponse(pathname: string, root: string): Promise<Response> {
  const name = matchSoundPath(pathname);
  if (!name || !isAbsolute(root)) return new Response(null, { status: 404 });
  let file: FileHandle | undefined;
  try {
    const rootInfo = lstatSync(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) return new Response(null, { status: 404 });
    const path = join(realpathSync(root), name);
    if (basename(path) !== name) return new Response(null, { status: 404 });
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.nlink > 1) return new Response(null, { status: 404 });
    const data = new Uint8Array(await file.readFile());
    if ((await file.stat()).nlink > 1) return new Response(null, { status: 404 });
    return new Response(data, { headers: {
      "Content-Type": "audio/webm",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=31536000, immutable",
    } });
  } catch { return new Response(null, { status: 404 }); }
  finally { await file?.close(); }
}
