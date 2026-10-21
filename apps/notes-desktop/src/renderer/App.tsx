import { ErrorBoundary } from "solid-js";
import { PageError } from "@polterware/frontend-design-system";
import { NotesShell, createShellBridge } from "@polterware/feature-notes-shell";
import { hideBootSplash } from "./boot-splash";
import { features } from "./features";

export function App() {
  return <ErrorBoundary fallback={(error, reset) => { hideBootSplash(); return <PageError title="Polterware Notes failed to start" message={error.message} onRetry={reset} />; }}>
    <NotesShell features={features} bridge={window.pwnotes ? createShellBridge(window.pwnotes) : undefined} onReady={() => hideBootSplash()} />
  </ErrorBoundary>;
}
