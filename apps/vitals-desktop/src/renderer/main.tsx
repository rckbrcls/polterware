import { render } from "solid-js/web";
import "@fontsource-variable/inter/opsz.css";
import "./styles.css";
import { App } from "./App";
import { hideBootSplash } from "./boot-splash";
import { VitalsDesignSystemProvider } from "./design-system";
import { connectDemoSession, installVitalsMock } from "../web/mock-bridge";

// Main passes the chrome mode on the URL so the first paint is already frosted or solid.
document.documentElement.dataset.shellChrome =
  new URLSearchParams(window.location.search).get("reduceTransparency") === "0" ? "vibrancy" : "solid";

const root = document.getElementById("root");
if (!root) throw new Error("root missing");

const usingMock = !window.vitals;
if (usingMock) installVitalsMock();

render(
  () => (
    <VitalsDesignSystemProvider storagePrefix="vitals">
      <App />
    </VitalsDesignSystemProvider>
  ),
  root,
);
requestAnimationFrame(() => hideBootSplash());

if (usingMock) setTimeout(connectDemoSession, 0);
