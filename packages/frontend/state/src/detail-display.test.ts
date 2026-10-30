import { describe, expect, it } from "vitest";

import { canExpandDetail, detailDisplayFor, isDocumentDetail } from "./detail-display";

describe("detailDisplayFor", () => {
  it("classifies peek, page, and both kinds", () => {
    expect(detailDisplayFor("inbox-item")).toBe("peek");
    expect(detailDisplayFor("change")).toBe("peek");
    expect(detailDisplayFor("doc")).toBe("page");
    expect(detailDisplayFor("fact")).toBe("page");
    expect(detailDisplayFor("decision")).toBe("page");
    expect(detailDisplayFor("card")).toBe("page");
    expect(detailDisplayFor("arch-node")).toBe("peek");
  });

  it("defaults unknown kinds to both", () => {
    expect(detailDisplayFor("service")).toBe("both");
    expect(detailDisplayFor(undefined)).toBe("both");
  });

  it("only peek kinds cannot expand", () => {
    expect(canExpandDetail("inbox-item")).toBe(false);
    expect(canExpandDetail("doc")).toBe(true);
    expect(canExpandDetail("card")).toBe(true);
  });

  it("limits document pages to Truth and Work entities, preserving Structure details", () => {
    for (const kind of ["decision", "doc", "card", "fact"]) expect(isDocumentDetail(kind)).toBe(true);
    for (const kind of ["arch-view", "structure-card", undefined]) expect(isDocumentDetail(kind)).toBe(false);
  });
});
