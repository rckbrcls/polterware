import { constants, existsSync, lstatSync, realpathSync } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";

const MOODS = ["sad", "hopeful", "happy", "euphoric"] as const;
const KINDS = ["streak", "completed"] as const;
const SCALES = ["", "@2x", "@3x"] as const;

export const CHARACTER_NAMES = [
  "notes-character.webp",
  ...KINDS.flatMap(kind => MOODS.flatMap(mood => SCALES.map(scale => `me-${kind}-${mood}${scale}.png`))),
] as const;

const CHARACTER_PATH = /^\/characters\/(notes-character\.webp|me-(?:streak|completed)-(?:sad|hopeful|happy|euphoric)(?:@[23]x)?\.png)$/;

export function matchCharacterPath(pathname: string): string | null {
  const match = CHARACTER_PATH.exec(pathname);
  return match ? match[1]! : null;
}

export function resolveCharactersRoot(appPath: string, resourcesPath: string, packaged: boolean): string {
  const extra = join(resourcesPath, "characters");
  const resources = join(appPath, "resources/characters");
  const published = join(appPath, "out/renderer/characters");
  const publicCopy = join(appPath, "src/renderer/public/characters");
  const candidates = packaged ? [extra, published] : [resources, publicCopy, published, extra];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]!;
}

function contentType(name: string): string {
  return extname(name).toLowerCase() === ".webp" ? "image/webp" : "image/png";
}

export async function characterResponse(pathname: string, root: string): Promise<Response> {
  const name = matchCharacterPath(pathname);
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
      "Content-Type": contentType(name),
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=31536000, immutable",
    } });
  } catch { return new Response(null, { status: 404 }); }
  finally { await file?.close(); }
}
