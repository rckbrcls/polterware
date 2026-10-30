import { For, Index, Match, Show, Switch, createSignal, type JSX } from "solid-js";
import type { StatusTone } from "@polterware/frontend-design-system";
import { dispatchStatusTone } from "./dispatch-bridge";
import type { TranscriptEntry } from "./run-log";
import { highlightTerminal } from "./terminal-highlight";
import "./run-terminal.css";

/** How many lines of a command's output show before "… +N lines". */
const OUTPUT_LINES = 6;

/**
 * A run's transcript set the way its agent's terminal prints it, in the terminal face with
 * highlighting from the app's palette: `›` steps with the command highlighted as shell and the
 * first lines of its output under an elbow, reasoning dimmed and italic, the reply as terminal
 * Markdown (headings, bullets, inline code, highlighted fences), and the core's lines as
 * `✓ verified …`. A live run ends on a blinking cursor.
 */
export function RunTerminal(props: { entries: readonly TranscriptEntry[]; live: boolean; empty: string }) {
  return (
    <div class="pw-term" role="log" aria-label="Agent output">
      <Show when={props.entries.length > 0} fallback={<div class="pw-term__muted">{props.empty}</div>}>
        <Index each={props.entries}>{(entry) => <TerminalEntry entry={entry()} />}</Index>
      </Show>
      <Show when={props.live}>
        <div class="pw-term__live"><span class="pw-term__cursor" aria-hidden="true" /> <span class="pw-term__muted">The agent is still writing.</span></div>
      </Show>
    </div>
  );
}

function TerminalEntry(props: { entry: TranscriptEntry }) {
  return (
    <Switch>
      <Match when={props.entry.kind === "step" && props.entry}>{(step) => <TerminalStep step={step()} />}</Match>
      <Match when={props.entry.kind === "thinking" && props.entry}>
        {(thinking) => <div class="pw-term__thinking">{thinking().text.replace(/\*\*(.+?)\*\*/g, "$1")}</div>}
      </Match>
      <Match when={props.entry.kind === "message" && props.entry}>{(message) => <TerminalMarkdown text={message().text} />}</Match>
      <Match when={props.entry.kind === "output" && props.entry}>{(output) => <TerminalOutput text={output().text} />}</Match>
      <Match when={props.entry.kind === "event" && props.entry}>
        {(event) => {
          const tone = () => dispatchStatusTone(event().event);
          return (
            <div class="pw-term__event" data-tone={tone()}>
              <span aria-hidden="true">{toneGlyph(tone())}</span> <span class="pw-term__event-kind">{event().event}</span> {event().text}
            </div>
          );
        }}
      </Match>
    </Switch>
  );
}

const toneGlyph = (tone: StatusTone) => (tone === "ok" || tone === "healthy" ? "✓" : tone === "danger" || tone === "down" ? "✗" : "•");

const VERB = /^(Running|Reading|Writing|Editing|Edited|Searching the web for|Searching|Fetching|Called) ([\s\S]+)$/;

function TerminalStep(props: { step: Extract<TranscriptEntry, { kind: "step" }> }) {
  const parts = () => VERB.exec(props.step.text);
  return (
    <div class="pw-term__block">
      <div class="pw-term__step" data-failed={props.step.failed ? "" : undefined}>
        <span class="pw-term__bullet" aria-hidden="true">›</span>
        <span class="pw-term__line">
          <Show when={parts()} fallback={<span class="pw-term__verb">{props.step.text}</span>}>
            {(match) => (
              <>
                <span class="pw-term__verb">{match()[1]}</span>{" "}
                <Show when={match()[1] === "Running"} fallback={<span class="pw-term__target">{match()[2]}</span>}>
                  <code class="pw-term__code" innerHTML={highlightTerminal(match()[2]!, "bash")} />
                </Show>
              </>
            )}
          </Show>
          <Show when={props.step.detail}>{(detail) => <span class="pw-term__detail"> {detail()}</span>}</Show>
        </span>
      </div>
      <Show when={props.step.output?.trim()}>{(output) => <TerminalOutput text={output()} elbow />}</Show>
    </div>
  );
}

/** A command's output under its step: the first lines, then "… +N lines" that opens the rest. */
function TerminalOutput(props: { text: string; elbow?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const lines = () => props.text.replace(/\s+$/, "").split("\n");
  const hidden = () => (props.elbow && !open() ? Math.max(0, lines().length - OUTPUT_LINES) : 0);
  const shown = () => (hidden() ? lines().slice(0, OUTPUT_LINES) : lines()).join("\n");
  return (
    <div class="pw-term__output" classList={{ "pw-term__output--elbow": props.elbow }}>
      <Show when={props.elbow}><span class="pw-term__elbow" aria-hidden="true">└</span></Show>
      <div class="min-w-0">
        <pre class="pw-term__pre"><code innerHTML={highlightTerminal(shown())} /></pre>
        <Show when={hidden()}>
          <button type="button" class="pw-term__more" onClick={() => setOpen(true)}>… +{hidden()} lines</button>
        </Show>
      </div>
    </div>
  );
}

type MarkdownBlock =
  | { kind: "code"; language: string; code: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "item"; marker: string; indent: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "blank" }
  | { kind: "text"; text: string };

/** Splits a reply into the line blocks a terminal renders; fences keep their language. */
export function terminalBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      const code: string[] = [];
      for (index += 1; index < lines.length && !lines[index]!.trimStart().startsWith(fence[1]!); index += 1) code.push(lines[index]!);
      blocks.push({ kind: "code", language: fence[2]!.toLowerCase(), code: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) blocks.push({ kind: "rule" });
    else if (item) blocks.push({ kind: "item", indent: Math.floor(item[1]!.length / 2), marker: /\d/.test(item[2]!) ? item[2]! : "•", text: item[3]! });
    else if (/^\s*>/.test(line)) blocks.push({ kind: "quote", text: line.replace(/^\s*>\s?/, "") });
    else if (!line.trim()) {
      if (blocks.length && blocks[blocks.length - 1]!.kind !== "blank") blocks.push({ kind: "blank" });
    } else blocks.push({ kind: "text", text: line });
  }
  while (blocks[blocks.length - 1]?.kind === "blank") blocks.pop();
  return blocks;
}

function TerminalMarkdown(props: { text: string }) {
  return (
    <div class="pw-term__message" aria-label="Agent response">
      <For each={terminalBlocks(props.text)}>
        {(block) => (
          <Switch fallback={<div class="pw-term__text"><Inline text={(block as { text: string }).text} /></div>}>
            <Match when={block.kind === "code" && block}>
              {(code) => <pre class="pw-term__fence"><code innerHTML={highlightTerminal(code().code, code().language, true)} /></pre>}
            </Match>
            <Match when={block.kind === "heading" && block}>
              {(heading) => <div class="pw-term__heading" data-level={heading().level}><Inline text={heading().text} /></div>}
            </Match>
            <Match when={block.kind === "item" && block}>
              {(item) => (
                <div class="pw-term__item" style={{ "padding-left": `${item().indent * 2}ch` }}>
                  <span class="pw-term__marker" aria-hidden="true">{item().marker}</span>
                  <span class="min-w-0"><Inline text={item().text} /></span>
                </div>
              )}
            </Match>
            <Match when={block.kind === "quote" && block}>
              {(quote) => <div class="pw-term__quote"><span aria-hidden="true">│ </span><Inline text={quote().text} /></div>}
            </Match>
            <Match when={block.kind === "rule"}><div class="pw-term__rule" aria-hidden="true">────────</div></Match>
            <Match when={block.kind === "blank"}><div class="pw-term__blank" /></Match>
          </Switch>
        )}
      </For>
    </div>
  );
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;

/** Inline code, bold, italic, and links, as a terminal renderer colors them. */
function Inline(props: { text: string }): JSX.Element {
  const parts = () => props.text.split(INLINE).filter(Boolean);
  return (
    <For each={parts()}>
      {(part) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code class="pw-term__inline-code">{part.slice(1, -1)}</code>;
        if (/^(\*\*|__).+\1$/.test(part)) return <strong class="pw-term__strong">{part.slice(2, -2)}</strong>;
        if (/^\*[^*].*\*$/.test(part)) return <em>{part.slice(1, -1)}</em>;
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) return <span class="pw-term__link">{link[1]}<span class="pw-term__muted"> ({link[2]})</span></span>;
        return <>{part}</>;
      }}
    </For>
  );
}
