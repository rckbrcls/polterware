// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { FilterPopover } from "./filter-popover";

describe("FilterPopover", () => {
  it("exports a shared filter component", () => {
    expect(FilterPopover).toBeDefined();
  });
});
