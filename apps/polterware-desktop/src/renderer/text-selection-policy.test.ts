// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const baseCssPath = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../packages/configuration/tailwind/base.css",
);

describe("desktop text selection policy", () => {
  it("defaults the shell to non-selectable and opts editable or copyable targets back in", () => {
    const css = readFileSync(baseCssPath, "utf8");

    expect(css).toMatch(/html[\s\S]*?body[\s\S]*?#root[\s\S]*?user-select:\s*none/);
    expect(css).toContain("textarea");
    expect(css).toContain(".ProseMirror");
    expect(css).toContain(".pw-selectable");
    expect(css).toMatch(
      /(?:textarea|\[contenteditable="true"\]|\.ProseMirror|code|pre|\.pw-selectable)[\s\S]*?user-select:\s*text/,
    );
  });

  it("does not put user-select: text on .control-field chrome", () => {
    const css = readFileSync(baseCssPath, "utf8");
    expect(css).not.toMatch(/\.control-field[^{]*\{[^}]*user-select:\s*text/s);
  });
});
