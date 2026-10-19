import type { VitalsApi } from "./api";

declare global {
  interface Window {
    vitals: VitalsApi;
  }
}

export {};
