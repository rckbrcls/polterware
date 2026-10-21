import type { DescMessage, DescMethodUnary, MessageShape as ContractMessage } from "@bufbuild/protobuf";
import type { AttachmentSchema, AttachmentService, NoteService, SettingsService } from "@polterware/notes-contracts";

/** Protobuf JSON: int64 is a decimal string, timestamps are RFC 3339. */
export type Wire<T> = T extends { $typeName: "google.protobuf.Timestamp" } ? string
  : T extends bigint ? string
  : T extends readonly (infer V)[] ? Wire<V>[]
  : T extends object ? { [K in keyof T as K extends "$typeName" ? never : K]?: Wire<T[K]> }
  : T;
export type JsonOf<S extends DescMessage> = Wire<ContractMessage<S>>;
type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: Wire<ContractMessage<S["method"][K]["input"]>>) => Promise<Wire<ContractMessage<S["method"][K]["output"]>>> : never;
};

export type AttachmentsBridge = {
  attachments: Namespace<typeof AttachmentService>;
  notes: Namespace<typeof NoteService>;
  settings: Namespace<typeof SettingsService>;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: {
    pickFiles(): Promise<string[]>;
    pathsForDroppedFiles(files: File[]): Promise<string[]>;
    writeTempFile(bytes: Uint8Array, name: string): Promise<string>;
    revealInFinder(attachmentUrl: string): Promise<void>;
    startMicrophone(): Promise<boolean>;
  };
};

export type AttachmentJSON = JsonOf<typeof AttachmentSchema>;
export type SaveState = "live" | "queued" | "failed" | "unavailable";
export type MicrophoneState = "idle" | "granted" | "denied" | "unavailable";
export type AttachmentKind = "photo" | "audio" | "file" | "link";

const NOTE_ID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const ATTACHMENT_FILE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}\.[a-zA-Z0-9]{1,10}$/;

export function revisionString(rev: string | number | bigint | undefined): string {
  if (typeof rev === "string" && rev !== "") return rev;
  if (typeof rev === "bigint") return rev.toString();
  if (typeof rev === "number" && Number.isFinite(rev)) return Math.trunc(rev).toString();
  return "0";
}

/** Preview URLs must be the Main-served scheme. Never file://, never OpenInfo absolutePath. */
export function previewUrl(relPath: string | undefined): string | undefined {
  if (!relPath) return undefined;
  const parts = relPath.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.length !== 2 || !NOTE_ID.test(parts[0]!) || !ATTACHMENT_FILE.test(parts[1]!)) return undefined;
  return `pwnotes-file://attachment/${parts[0]}/${parts[1]}`;
}

export function linkHost(url: string | undefined): string {
  if (!url) return "";
  try { return new URL(url).host || url; } catch { return url; }
}

const AUDIO_MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
};

/** Main `writeTempFile` cap. Refuse in the renderer before IPC. */
export const MAX_RECORDING_BYTES = 100 * 1024 * 1024;

/** Basename-only name with an audio extension Main already accepts. */
export function recordingFileName(mime: string | undefined): string {
  const subtype = mime?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!subtype) return "recording.webm";
  const ext = AUDIO_MIME_TO_EXT[subtype];
  if (!ext) throw new Error("Temp file name must use an audio extension");
  return `recording.${ext}`;
}

export function reorderIds(ids: readonly string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const FETCH_TITLES_ON = "Title fetching is on in Settings, but automatic fetching is unavailable in this build. Add a title yourself.";
export const FETCH_TITLES_OFF = "Title fetching is off. Add a title yourself.";
export const DROP_PATH_REFUSED = "One or more dropped files could not be imported. Polterware Notes only imports existing regular files with a granted path.";
export const RECORDING_OVERSIZE = "Recording exceeds 100 MB";
export const MICROPHONE_DENIED = "Microphone permission denied. Grant access in System Settings to record audio.";
export const MICROPHONE_UNAVAILABLE = "Microphone is unavailable on this device.";
