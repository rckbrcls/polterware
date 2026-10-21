// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { applyShellChromeFromBootQuery } from "./shell-chrome-boot";

describe("applyShellChromeFromBootQuery", () => {
  afterEach(() => {
    delete document.documentElement.dataset.shellChrome;
  });

  it("defaults to vibrancy when the query is absent", () => {
    expect(applyShellChromeFromBootQuery("")).toBe("vibrancy");
    expect(document.documentElement.dataset.shellChrome).toBe("vibrancy");
  });

  it("applies solid when reduceTransparency=1", () => {
    expect(applyShellChromeFromBootQuery("?reduceTransparency=1")).toBe("solid");
    expect(document.documentElement.dataset.shellChrome).toBe("solid");
  });

  it("applies vibrancy when reduceTransparency=0", () => {
    expect(applyShellChromeFromBootQuery("?reduceTransparency=0")).toBe("vibrancy");
    expect(document.documentElement.dataset.shellChrome).toBe("vibrancy");
  });
});
