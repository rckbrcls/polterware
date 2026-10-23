import type { NotesDesktopBridge } from "../shared/bridge.js";

declare global {
  interface Window {
    pwnotes: NotesDesktopBridge;
  }
}

export {};
