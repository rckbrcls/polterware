import { For } from "solid-js";

/** Illustrative session: the shape of dispatch output, not a recording. */
const lines: Array<{ kind: "cmd" | "out" | "ok" | "warn" | "dim"; text: string }> = [
  { kind: "cmd", text: "dispatch run --tier normal --background -" },
  { kind: "dim", text: "brief read from stdin · 12 lines" },
  { kind: "out", text: "id       20261021-142210-9a1c" },
  { kind: "out", text: "agent    codex · tier normal · worktree" },
  { kind: "cmd", text: "dispatch wait 20261021-142210-9a1c" },
  { kind: "ok", text: "COMPLETED  4 files · +82 −17 · 3m 41s" },
  { kind: "ok", text: "verify     passed" },
  { kind: "cmd", text: "dispatch merge 20261021-142210-9a1c" },
  { kind: "ok", text: "merged into feat/git-import" },
];

export function DispatchMockup(props: { compact?: boolean }) {
  return (
    <div class="mk-terminal" classList={{ "mk-compact": props.compact }} role="img" aria-label="Dispatch session delegating a task to a coding agent">
      <div class="mk-titlebar"><span class="mk-dots"><i /><i /><i /></span><span class="mk-title">~/code/polterware</span></div>
      <div class="mk-terminal-body">
        <For each={lines}>{(line) => (
          <div class={`mk-line mk-line-${line.kind}`}>
            {line.kind === "cmd" ? <><span class="mk-prompt">❯</span>{line.text}</> : line.text}
          </div>
        )}</For>
      </div>
    </div>
  );
}
