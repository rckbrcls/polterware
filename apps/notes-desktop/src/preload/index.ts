import { contextBridge, ipcRenderer, webUtils } from "electron";
import { RPC_METHODS } from "../shared/channels.js";
import { APP_METHODS, EVENTS, type NotesDesktopBridge } from "../shared/bridge.js";

const bridge: Record<string, unknown> = {};
for (const [namespace, methods] of Object.entries(RPC_METHODS)) {
  bridge[namespace] = Object.fromEntries(methods.map(method => [method,
    (input: unknown = {}) => ipcRenderer.invoke(`pwnotes:${namespace}:${method}`, input)]));
}
function subscribe<T>(channel: string, callback: (event: T) => void): () => void {
  const listener = (_event: unknown, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
function droppedPaths(files: unknown): string[] {
  const list = typeof FileList !== "undefined" && files instanceof FileList ? [...files]
    : Array.isArray(files) ? files : null;
  if (!list) throw new Error("Expected a File list");
  const paths: string[] = [];
  for (const file of list) {
    if (typeof File !== "undefined" && !(file instanceof File)) continue;
    try {
      const path = webUtils.getPathForFile(file as File);
      if (typeof path === "string" && path.length > 0 && path.length <= 4096) paths.push(path);
    } catch { /* Files without a native path are ignored. */ }
  }
  return paths;
}
bridge.onChange = (callback: Parameters<NotesDesktopBridge["onChange"]>[0]) => subscribe(EVENTS.change, callback);
bridge.app = {
  name: "Polterware Notes",
  ...Object.fromEntries(APP_METHODS.map(method => [method, (input?: unknown) => ipcRenderer.invoke(`pwnotes:app:${method}`, input)])),
  pathsForDroppedFiles: (files: File[]) => ipcRenderer.invoke("pwnotes:app:pathsForDroppedFiles", droppedPaths(files)),
  writeTempFile: (bytes: Uint8Array, name: string) => ipcRenderer.invoke("pwnotes:app:writeTempFile", { bytes, name }),
  onDeepLink: (callback: Parameters<NotesDesktopBridge["app"]["onDeepLink"]>[0]) => {
    const seen = new Set<string>();
    const deliver = (link: { url: string; route: string }) => {
      if (seen.has(link.url)) return;
      seen.add(link.url);
      callback(link);
    };
    const unsubscribe = subscribe(EVENTS.deepLink, deliver);
    void ipcRenderer.invoke("pwnotes:app:getDeepLink").then((link: { url: string; route: string } | null) => {
      if (link) deliver(link);
    });
    return unsubscribe;
  },
};
contextBridge.exposeInMainWorld("pwnotes", bridge as unknown as NotesDesktopBridge);
