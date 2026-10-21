import { updateSettings } from "./settings.js";

export function readTheme(): "dark" | "light" {
  return "dark";
}

export function writeTheme(theme: "dark" | "light"): void {
  updateSettings({ theme });
}
