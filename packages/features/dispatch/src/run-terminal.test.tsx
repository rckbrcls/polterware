import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { buildTranscript, unwrapShell } from "./run-log";
import { RunTerminal, terminalBlocks } from "./run-terminal";
import { highlightTerminal, looksLikeDiff } from "./terminal-highlight";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

describe("run terminal", () => {
  it("keeps a codex command's output and drops its shell wrapper", () => {
    expect(unwrapShell("bash -lc 'go test ./...'")).toBe("go test ./...");
    expect(unwrapShell("/bin/zsh -lc \"rg -n x\"")).toBe("rg -n x");
    expect(unwrapShell("go vet")).toBe("go vet");
    const log = JSON.stringify({ type: "item.completed", item: { id: "c1", type: "command_execution", command: "bash -lc 'ls'", aggregated_output: "a\nb\n", exit_code: 0 } });
    expect(buildTranscript(log)).toEqual([{ kind: "step", text: "Running ls", failed: false, output: "a\nb" }]);
  });

  it("highlights shell, diffs, and fenced code with the app's tokens, and escapes the rest", () => {
    expect(highlightTerminal('rg -n "VerifyRun"', "bash")).toContain('class="hljs-string"');
    expect(looksLikeDiff("@@ -1 +1 @@\n-a\n+b")).toBe(true);
    expect(highlightTerminal("-a\n+b")).toContain("hljs-addition");
    expect(highlightTerminal("<b>plain</b>")).toBe("&lt;b&gt;plain&lt;/b&gt;");
    expect(terminalBlocks("## Plan\n\n- one\n  1. two\n```go\nfunc a() {}\n```\n\n\n")).toEqual([
      { kind: "heading", level: 2, text: "Plan" },
      { kind: "blank" },
      { kind: "item", indent: 0, marker: "•", text: "one" },
      { kind: "item", indent: 1, marker: "1.", text: "two" },
      { kind: "code", language: "go", code: "func a() {}" },
    ]);
  });

  it("prints steps, folded output, the reply, and the core's lines like the agent's terminal", () => {
    const output = Array.from({ length: 9 }, (_, index) => `line ${index + 1}`).join("\n");
    dispose = render(() => (
      <RunTerminal live empty="No output" entries={[
        { kind: "step", text: "Running go test ./...", output },
        { kind: "thinking", text: "**Planning**" },
        { kind: "message", text: "Fixed `store.go` and **tests** on the *conflict* path." },
        { kind: "event", event: "verified", text: "all checks passed" },
      ]} />
    ), document.body);
    const term = document.querySelector<HTMLElement>(".pw-term")!;
    expect(term.querySelector(".pw-term__verb")?.textContent).toBe("Running");
    expect(term.querySelector(".pw-term__code .hljs-built_in, .pw-term__code span")).not.toBeNull();
    expect(term.querySelector(".pw-term__output pre")?.textContent).toBe(output.split("\n").slice(0, 6).join("\n"));
    term.querySelector<HTMLButtonElement>(".pw-term__more")!.click();
    expect(term.querySelector(".pw-term__output pre")?.textContent).toBe(output);
    expect(term.querySelector(".pw-term__thinking")?.textContent).toBe("Planning");
    expect(term.querySelector(".pw-term__inline-code")?.textContent).toBe("store.go");
    expect(term.querySelector(".pw-term__strong")?.textContent).toBe("tests");
    expect(term.querySelector(".pw-term__message em")?.textContent).toBe("conflict");
    expect(term.querySelector('.pw-term__event[data-tone="ok"]')?.textContent).toBe("✓ verified all checks passed");
    expect(term.querySelector(".pw-term__cursor")).not.toBeNull();
  });
});
