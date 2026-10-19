import { render } from "solid-js/web";
import "@fontsource-variable/inter/opsz.css";
import "./styles.css";
import { App } from "./App";
import { installBrowserDevBridge } from "./browser-dev-bridge";

if (import.meta.env.DEV) installBrowserDevBridge();

const reduceTransparency = new URLSearchParams(window.location.search).get("reduceTransparency") === "1";
document.documentElement.dataset.shellChrome = reduceTransparency ? "solid" : "vibrancy";

const root = document.getElementById("root");
if (!root) throw new Error("root missing");

render(() => <App />, root);
