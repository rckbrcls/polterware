/* @refresh reload */
import { render } from "solid-js/web";
import { DesignSystemProvider, TextureFaceProvider } from "@polterware/frontend-design-system";
import { App } from "./App";
import { CommanderApp } from "./CommanderApp";
import { attachDesktopDropGuards } from "./desktop-drop-guards.js";
import { installBrowserDevBridge } from "./browser-dev-bridge.js";
import { hideBootSplash } from "./boot-splash.js";
import { applyShellChromeFromBootQuery } from "./shell-chrome-boot.js";
// Inter with wght + opsz axes: weight changes without reflow (--font-variation-*).
import "@fontsource-variable/inter/opsz.css";
import "./styles.css";

attachDesktopDropGuards();
applyShellChromeFromBootQuery();
if (import.meta.env.DEV) installBrowserDevBridge();

const root = document.getElementById("root");
if (!root) throw new Error("root missing");

const surface = new URLSearchParams(window.location.search).get("surface");

if (surface === "commander") {
  document.documentElement.classList.add("commander-surface");
  hideBootSplash({ immediate: true });
  render(() => <DesignSystemProvider storagePrefix="polterware"><TextureFaceProvider><CommanderApp /></TextureFaceProvider></DesignSystemProvider>, root);
} else {
  render(() => <DesignSystemProvider storagePrefix="polterware"><TextureFaceProvider><App /></TextureFaceProvider></DesignSystemProvider>, root);
}
