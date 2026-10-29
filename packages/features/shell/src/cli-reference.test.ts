import { describe, expect, it } from "vitest";
import { CLI_COMMANDS, CLI_COMMAND_GROUPS, cliReferenceMarkdown } from "./cli-reference";

describe("CLI reference", () => {
  it("files every command under exactly one group", () => {
    const grouped = CLI_COMMAND_GROUPS.flatMap((group) => group.commands);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(CLI_COMMANDS.map((command) => command.id).sort());
  });

  it("documents the delegation and canvas commands in the copied Markdown", () => {
    const markdown = cliReferenceMarkdown();
    for (const name of ["polterware canvas", "polterware scope", "polterware run", "polterware wait", "polterware tiers"]) {
      expect(markdown).toContain(`#### ${name}\n`);
    }
  });
});
