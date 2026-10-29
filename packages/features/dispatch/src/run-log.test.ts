import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTranscript, stripAnsi } from "./run-log";

const fixture = (agent: string) =>
  readFileSync(resolve(__dirname, `../../../../backend/providers/dispatch/adapters/testdata/${agent}/stream.ndjson`), "utf8");

describe("run transcript", () => {
  it("reads a plain reply as Markdown between the core's event lines", () => {
    const log = "## Plan\n\n- Read the store\n- Add the handler\n[verified] all checks passed\nDone.\n";
    expect(buildTranscript(log)).toEqual([
      { kind: "message", text: "## Plan\n\n- Read the store\n- Add the handler" },
      { kind: "event", event: "verified", text: "all checks passed" },
      { kind: "message", text: "Done." },
    ]);
    expect(buildTranscript("```\n[note] not an event\n```")).toEqual([{ kind: "message", text: "```\n[note] not an event\n```" }]);
    expect(buildTranscript("  \n")).toEqual([]);
  });

  it("reads codex --json as steps, reasoning, and the reply", () => {
    const log = [
      JSON.stringify({ type: "thread.started", thread_id: "t1" }),
      JSON.stringify({ type: "item.completed", item: { id: "i0", type: "reasoning", text: "**Planning**" } }),
      JSON.stringify({ type: "item.started", item: { id: "i1", type: "command_execution", command: "go test ./...", status: "in_progress" } }),
      JSON.stringify({ type: "item.completed", item: { id: "i1", type: "command_execution", command: "go test ./...", exit_code: 1 } }),
      JSON.stringify({ type: "item.completed", item: { id: "i2", type: "file_change", changes: [{ path: "a.go", kind: "update" }] } }),
      JSON.stringify({ type: "item.completed", item: { id: "i3", type: "agent_message", text: "Fixed **it**." } }),
      JSON.stringify({ type: "turn.completed", usage: {} }),
      "warning: something on stderr",
      '{"type":"item.sta',
    ].join("\n");
    expect(buildTranscript(log)).toEqual([
      { kind: "thinking", text: "**Planning**" },
      { kind: "step", text: "Running go test ./...", failed: true, detail: "exit 1" },
      { kind: "step", text: "Edited a.go" },
      { kind: "message", text: "Fixed **it**." },
      { kind: "output", text: "warning: something on stderr" },
    ]);
  });

  it("joins cursor and grok deltas into one reply and names their tool calls", () => {
    const cursor = buildTranscript(fixture("cursor"));
    expect(cursor.filter((entry) => entry.kind === "step")).toEqual([{ kind: "step", text: "Reading /tmp/ws/a.txt", failed: false }]);
    expect(cursor.filter((entry) => entry.kind === "message")).toEqual([{ kind: "message", text: "O arquivo `a.txt` contém apenas a palavra “hello”." }]);
    expect(cursor[0]).toEqual({ kind: "thinking", text: "Reading a.txt to prepare a one-sentence reply." });

    const grok = buildTranscript(fixture("grok"));
    expect(grok[0]).toEqual({ kind: "step", text: "Reading /tmp/ws/a.txt" });
    expect(grok.find((entry) => entry.kind === "message")).toEqual({ kind: "message", text: "The file says hello." });
  });

  it("falls back to the stored answer and strips terminal escapes", () => {
    expect(buildTranscript(JSON.stringify({ type: "turn.started" }), "Done.")).toEqual([{ kind: "message", text: "Done." }]);
    expect(stripAnsi("\u001b[32mok\u001b[0m\n10%\r50%\r100%")).toBe("ok\n100%");
  });
});
