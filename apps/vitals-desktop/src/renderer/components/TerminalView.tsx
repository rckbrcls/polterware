import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { createEffect, onCleanup, onMount } from "solid-js";

const encoder = new TextEncoder();

function tokenColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function terminalTheme(): ITheme {
  const background = tokenColor("--color-surface-subtle");
  const foreground = tokenColor("--color-text-primary");
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: tokenColor("--color-surface-selected"),
    selectionForeground: foreground,
  };
}

function dimensionsOk(cols: number, rows: number): boolean {
  return Number.isInteger(cols) && Number.isInteger(rows) && cols >= 1 && cols <= 500 && rows >= 1 && rows <= 500;
}

export function TerminalView(props: { sessionId: string; connected: boolean; visible: boolean }) {
  let host: HTMLDivElement | undefined;
  let terminal: Terminal | undefined;
  let fit: FitAddon | undefined;
  let opened = false;

  const fitNow = () => {
    if (!props.visible || !host || !terminal || !fit) return;
    if (host.clientWidth < 16 || host.clientHeight < 16) return;
    try {
      fit.fit();
    } catch {
      return;
    }
    if (!opened || !dimensionsOk(terminal.cols, terminal.rows)) return;
    void window.vitals
      .shellResize({ sessionId: props.sessionId, cols: terminal.cols, rows: terminal.rows })
      .catch(() => {});
  };

  const openShell = () => {
    if (opened || !terminal || !dimensionsOk(terminal.cols, terminal.rows)) return;
    opened = true;
    void window.vitals
      .shellOpen({ sessionId: props.sessionId, cols: terminal.cols, rows: terminal.rows })
      .catch((error: unknown) => {
        opened = false;
        terminal?.writeln(`\r\n[${error instanceof Error ? error.message : "Shell failed"}]`);
      });
  };

  onMount(() => {
    if (!host) return;
    const sessionId = props.sessionId;
    terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      allowTransparency: false,
      theme: terminalTheme(),
    });
    fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);

    terminal.onData((data) => {
      if (opened) void window.vitals.shellWrite({ sessionId, data });
    });

    const offData = window.vitals.onShellData((ev) => {
      if (ev.sessionId !== sessionId || !terminal) return;
      opened = true;
      terminal.write(ev.data);
      void window.vitals.shellAck({ sessionId, bytes: encoder.encode(ev.data).byteLength }).catch(() => {});
    });
    const offExit = window.vitals.onShellExit((ev) => {
      if (ev.sessionId !== sessionId) return;
      opened = false;
      terminal?.writeln("\r\n[shell closed — reopen the Terminal tab to start a new one]");
    });

    const observer = new ResizeObserver(() => fitNow());
    observer.observe(host);

    onCleanup(() => {
      observer.disconnect();
      offData();
      offExit();
      void window.vitals.shellClose(sessionId);
      terminal?.dispose();
      terminal = undefined;
    });
  });

  createEffect(() => {
    if (!props.visible || !props.connected) return;
    requestAnimationFrame(() => {
      fitNow();
      openShell();
    });
  });

  return (
    <div
      ref={host}
      class="vitals-terminal"
      style={{ height: "100%", width: "100%", "background-color": "var(--color-surface-subtle)" }}
    />
  );
}
