import { For, createSignal, onCleanup, onMount } from "solid-js";
import { prefersReducedMotion } from "@polterware/frontend-design-system";
import { CLI } from "../../data/products";

type Line = { kind: "cmd" | "out" | "ok" | "warn" | "dim"; text: string };

/** Illustrative session: the shape of the CLI's output, not a recording. */
export const sessions = {
  status: [
    { kind: "cmd", text: `${CLI} status` },
    { kind: "out", text: "card     git-import · build" },
    { kind: "out", text: "branch   feat/git-import" },
    { kind: "out", text: "handoff  2h ago · codex · stamping revision on facts" },
    { kind: "warn", text: "open     1 blocking question · Include merge commits?" },
    { kind: "cmd", text: `${CLI} task claim git-import#T2` },
    { kind: "ok", text: "claimed  T2 Stamp revision on facts" },
    { kind: "cmd", text: `${CLI} apply plan.pw.md --dry-run` },
    { kind: "out", text: "1 card · 2 tasks · 1 decision proposed" },
    { kind: "cmd", text: `${CLI} handoff --card git-import --note "T2 done"` },
    { kind: "ok", text: "handoff recorded for the next session" },
  ],
  agents: [
    { kind: "cmd", text: `${CLI} setup claude` },
    { kind: "ok", text: "installed  Polterware plugin for Claude Code" },
    { kind: "cmd", text: `${CLI} mcp` },
    { kind: "dim", text: "attached to the local core · stdio" },
    { kind: "out", text: "→ read   compiled context for “auth” · 8k budget" },
    { kind: "out", text: "→ read   3 facts · 2 decisions · 4 evidence" },
    { kind: "warn", text: "→ drift  1 conflict with Verdict-012" },
    { kind: "ok", text: "→ write  W-45 updated · audited" },
  ],
} satisfies Record<string, Line[]>;

export function CliTerminalMockup(props: { session?: keyof typeof sessions; compact?: boolean; title?: string }) {
  const lines = (): Line[] => sessions[props.session ?? "status"];
  const [shown, setShown] = createSignal(lines().length);
  let timer: number | undefined;

  onMount(() => {
    if (prefersReducedMotion()) return;
    setShown(0);
    const tick = () => {
      const next = shown() + 1;
      if (next > lines().length + 6) {
        setShown(0);
      } else {
        setShown(next);
      }
      const line = lines()[shown() - 1];
      timer = window.setTimeout(tick, line?.kind === "cmd" ? 700 : 260);
    };
    timer = window.setTimeout(tick, 400);
    onCleanup(() => window.clearTimeout(timer));
  });

  return (
    <div class="mk-terminal" classList={{ "mk-compact": props.compact }} role="img" aria-label="Polterware CLI session in a terminal">
      <div class="mk-titlebar"><span class="mk-dots"><i /><i /><i /></span><span class="mk-title">{props.title ?? "~/code/polterware"}</span></div>
      <div class="mk-terminal-body">
        <For each={lines().slice(0, Math.min(shown(), lines().length))}>{(line) => (
          <div class={`mk-line mk-line-${line.kind}`}>
            {line.kind === "cmd" ? <><span class="mk-prompt">❯</span>{line.text}</> : line.text}
          </div>
        )}</For>
        <div class="mk-line"><span class="mk-prompt">❯</span><span class="mk-caret" /></div>
      </div>
    </div>
  );
}
