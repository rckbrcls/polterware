import type { PolterwareBridge } from "../../preload/bridge.js";

declare global {
  interface Window {
    polterware: PolterwareBridge;
  }
}

export {};
