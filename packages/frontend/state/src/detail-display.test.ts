import { describe, expect, it } from "vitest";

import { canExpandDetail, detailDisplayFor, isDocumentDetail } from "./detail-display";

describe("detailDisplayFor", () => {
  it("classifies peek, page, and both kinds", () => {
    expect(detailDisplayFor("fact")).toBe("peek");
    expect(detailDisplayFor("inbox-item")).toBe("peek");
    expect(detailDisplayFor("change")).toBe("peek");
    expect(detailDisplayFor("evidence")).toBe("page");
    expect(detailDisplayFor("decision")).toBe("page");
    expect(detailDisplayFor("card")).toBe("page");
    expect(detailDisplayFor("arch-node")).toBe("both");
  });

  it("defaults unknown kinds to both", () => {
    expect(detailDisplayFor("service")).toBe("both");
    expect(detailDisplayFor(undefined)).toBe("both");
  });

  it("only peek kinds cannot expand", () => {
    expect(canExpandDetail("fact")).toBe(false);
    expect(canExpandDetail("evidence")).toBe(true);
    expect(canExpandDetail("card")).toBe(true);
  });

  it("limits writing canvases to knowledge documents, preserving Structure and fact details", () => {
    for (const kind of ["decision", "evidence", "card"]) expect(isDocumentDetail(kind)).toBe(true);
    for (const kind of ["arch-view", "structure-card", "fact", undefined]) expect(isDocumentDetail(kind)).toBe(false);
  });
});
