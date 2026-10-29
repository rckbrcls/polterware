/**
 * A line of a run's transcript, read the way the agent's CLI prints it: what the agent is doing
 * (`step`), its reasoning (`thinking`), its reply (`message`, Markdown), raw terminal output
 * (`output`), and the lines the core recorded between them (`event`, from `[kind] text`).
 */
export type TranscriptEntry =
  | { kind: "step"; text: string; detail?: string; failed?: boolean }
  | { kind: "thinking"; text: string }
  | { kind: "message"; text: string }
  | { kind: "output"; text: string }
  | { kind: "event"; event: string; text: string };

const EVENT_LINE = /^\[([a-z][a-z_-]*)\] (.*)$/;
// CSI and OSC escape sequences; a CLI that colors its output leaves these in the log.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

/** Drops terminal escapes and keeps what a carriage return left visible on each line. */
export function stripAnsi(text: string): string {
  return text
    .replace(ANSI, "")
    .split("\n")
    .map((line) => {
      const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
      const cut = trimmed.lastIndexOf("\r");
      return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
    })
    .join("\n");
}

type Json = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The first string among a tool's usual argument names: the path, command, or query it acted on. */
function target(args: Json): string {
  for (const key of ["command", "cmd", "path", "file_path", "target_file", "filePath", "pattern", "query", "url", "glob"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.every((part) => typeof part === "string")) return value.join(" ");
  }
  return "";
}

/** "Reading a.txt", "Running go test": the verb a terminal agent prints for a tool. */
function stepFor(tool: string, args: Json): { text: string; detail?: string } {
  const name = tool.replace(/ToolCall$/, "").replace(/[_-]/g, " ").trim();
  const lower = name.toLowerCase().replace(/\s/g, "");
  const on = target(args);
  const verb =
    /shell|bash|terminal|command|exec/.test(lower) ? "Running"
    : /read|view|cat/.test(lower) ? "Reading"
    : /write|create/.test(lower) ? "Writing"
    : /edit|replace|patch|update|delete/.test(lower) ? "Editing"
    : /grep|glob|search|find|ls|list/.test(lower) ? "Searching"
    : /fetch|web/.test(lower) ? "Fetching"
    : "";
  if (verb) return { text: on ? `${verb} ${on}` : `${verb} (${name})` };
  return { text: name || "Tool call", detail: on || undefined };
}

/**
 * Reads the log of a run as its CLI would show it. Codex (`--json`), Cursor (`stream-json`),
 * Grok (`streaming-json`), and OpenCode write one JSON event per line: tool calls become
 * steps, reasoning stays apart from the reply, and streamed deltas join into one message.
 * A log with no JSON is the agent's plain reply and renders as Markdown; next to JSON, plain
 * lines are the CLI's own terminal output. `answer`, the stored final reply, closes a
 * transcript whose stream holds none.
 */
export function buildTranscript(log: string, answer = ""): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const lines = stripAnsi(log).split("\n");
  const streamed = lines.some(isJsonEvent);
  const items = new Map<string, number>(); // codex item / tool call id → entry index
  let text: string[] = [];
  let fenced = false;
  let delta: { kind: "message" | "thinking"; index: number } | undefined;

  const flushText = () => {
    const joined = text.join("\n").replace(/^\n+|\s+$/g, "");
    if (joined.trim()) entries.push({ kind: streamed ? "output" : "message", text: joined });
    text = [];
  };
  const push = (entry: TranscriptEntry) => {
    delta = undefined;
    entries.push(entry);
    return entries.length - 1;
  };
  /** Appends a streamed chunk to the open message or thinking block, or opens one. */
  const append = (kind: "message" | "thinking", chunk: string) => {
    if (!chunk) return;
    const open = delta && delta.kind === kind ? entries[delta.index] : undefined;
    if (open && (open.kind === "message" || open.kind === "thinking")) {
      open.text += chunk;
      return;
    }
    const index = push({ kind, text: chunk });
    delta = { kind, index };
  };
  /** A complete message replaces the deltas that streamed it. */
  const complete = (kind: "message" | "thinking", full: string) => {
    if (!full.trim()) return;
    const open = delta && delta.kind === kind ? entries[delta.index] : undefined;
    if (open && (open.kind === "message" || open.kind === "thinking")) open.text = full;
    else push({ kind, text: full });
    delta = undefined;
  };
  const step = (id: string, entry: Extract<TranscriptEntry, { kind: "step" }>) => {
    const known = id ? items.get(id) : undefined;
    if (known !== undefined) {
      entries[known] = { ...entries[known], ...entry } as TranscriptEntry;
      return;
    }
    const index = push(entry);
    if (id) items.set(id, index);
  };

  lines.forEach((line, index) => {
    if (!fenced && line.trimStart().startsWith("{")) {
      const ev = parseJson(line);
      if (!ev) {
        // The last line of a live log may still be arriving.
        if (index === lines.length - 1) return;
      } else {
        flushText();
        readEvent(ev);
        return;
      }
    }
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const event = fenced ? null : EVENT_LINE.exec(line);
    if (event) {
      flushText();
      push({ kind: "event", event: event[1]!, text: event[2]!.trim() });
      return;
    }
    text.push(line);
  });
  flushText();

  for (const entry of entries) {
    if (entry.kind === "message" || entry.kind === "thinking") entry.text = entry.text.trim();
  }
  const result = entries.filter((entry) => entry.kind !== "message" && entry.kind !== "thinking" || entry.text);
  if (answer.trim() && !result.some((entry) => entry.kind === "message")) {
    result.push({ kind: "message", text: stripAnsi(answer).trim() });
  }
  return result;

  function readEvent(ev: Json) {
    const type = str(ev.type);
    // Codex: thread / turn / item events.
    if (type.startsWith("item.")) {
      const item = obj(ev.item);
      const id = str(item.id);
      const itemType = str(item.type ?? item.item_type);
      const done = type === "item.completed";
      if (itemType === "agent_message" || itemType === "assistant_message") {
        if (done) complete("message", str(item.text));
      } else if (itemType === "reasoning") {
        if (done) complete("thinking", str(item.text));
      } else if (itemType === "command_execution") {
        const exit = typeof item.exit_code === "number" ? item.exit_code : undefined;
        step(id, { kind: "step", text: `Running ${str(item.command)}`, failed: exit !== undefined && exit !== 0, detail: exit ? `exit ${exit}` : undefined });
      } else if (itemType === "file_change") {
        const changes = arr(item.changes).map(obj);
        step(id, { kind: "step", text: `Edited ${changes.map((change) => str(change.path)).filter(Boolean).join(", ") || "files"}` });
      } else if (itemType === "mcp_tool_call") {
        step(id, { kind: "step", text: `Called ${[str(item.server), str(item.tool)].filter(Boolean).join(".")}`, failed: str(item.status) === "failed" });
      } else if (itemType === "web_search") {
        step(id, { kind: "step", text: `Searching the web for ${str(item.query)}` });
      } else if (itemType === "error") {
        push({ kind: "event", event: "failed", text: str(item.message) });
      }
      return;
    }
    if (type === "turn.failed" || type === "error") {
      const message = str(obj(ev.error).message) || str(ev.message);
      if (message) push({ kind: "event", event: "failed", text: message });
      return;
    }
    // Cursor: thinking / assistant deltas carry timestamp_ms; the full message does not.
    if (type === "thinking") {
      append("thinking", str(ev.text));
      return;
    }
    if (type === "assistant" && ev.message) {
      const chunk = arr(obj(ev.message).content).map(obj).filter((part) => str(part.type) === "text").map((part) => str(part.text)).join("");
      if (ev.timestamp_ms !== undefined) append("message", chunk);
      else complete("message", chunk);
      return;
    }
    if (type === "tool_call" && ev.tool_call) {
      const call = obj(ev.tool_call);
      const tool = Object.keys(call).find((key) => key.endsWith("ToolCall")) ?? "";
      const body = obj(call[tool]);
      const failed = Boolean(obj(body.result).error) || Boolean(obj(body.result).failure);
      step(str(ev.call_id), { kind: "step", ...stepFor(tool, obj(body.args)), failed });
      return;
    }
    if (type === "result") {
      // The reply again, already shown from the stream; kept only when nothing streamed.
      if (!entries.some((entry) => entry.kind === "message")) complete("message", str(ev.result));
      return;
    }
    // Grok: text deltas and ACP-style tool calls.
    if (type === "text" && typeof ev.data === "string") {
      append("message", ev.data);
      return;
    }
    if ((type === "thought" || type === "reasoning") && typeof ev.data === "string") {
      append("thinking", ev.data);
      return;
    }
    if (type === "tool_call" && (ev.toolName || ev.title)) {
      step(str(ev.toolCallId), { kind: "step", ...stepFor(str(ev.toolName) || str(ev.title), obj(ev.rawInput)) });
      return;
    }
    if (type === "tool_call_update") {
      const known = items.get(str(ev.toolCallId));
      const entry = known !== undefined ? entries[known] : undefined;
      if (entry?.kind === "step" && str(ev.status) === "failed") entry.failed = true;
      return;
    }
    // OpenCode: parts.
    if (ev.part) {
      const part = obj(ev.part);
      if (type === "text") append("message", str(part.text));
      else if (type === "reasoning") append("thinking", str(part.text));
      else if (type === "tool_use" || type === "tool") {
        const state = obj(part.state);
        step(str(part.callID) || str(part.id), { kind: "step", ...stepFor(str(part.tool), obj(state.input)), failed: str(state.status) === "error" });
      }
      return;
    }
    // A single JSON reply (Antigravity `--output-format json`).
    for (const key of ["response", "result", "output", "text"]) {
      if (typeof ev[key] === "string" && !type) {
        complete("message", ev[key] as string);
        return;
      }
    }
  }
}

function parseJson(line: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(line.trim());
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
  } catch {
    return undefined;
  }
}

function isJsonEvent(line: string): boolean {
  return line.trimStart().startsWith("{") && parseJson(line) !== undefined;
}
