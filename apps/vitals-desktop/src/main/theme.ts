import { nativeTheme } from "electron";
import { getSettings, updateSettings } from "./settings.js";

export function readTheme(): "dark" | "light" {
  const theme = getSettings().theme;
  return theme === "system" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : theme;
}

export function writeTheme(theme: "dark" | "light"): void {
  updateSettings({ theme });
}
