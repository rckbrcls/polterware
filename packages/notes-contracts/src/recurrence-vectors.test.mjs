import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vectorsPath = new URL("../../../notes/backend/domains/schedule/testdata/recurrence_vectors.json", import.meta.url);

describe("recurrence vectors", () => {
  const doc = JSON.parse(readFileSync(vectorsPath, "utf8"));

  it("contains the 14 cases from the recurrence spec", () => {
    expect(doc.cases.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(doc.cases[12].query.kind).toBe("next");
    expect(doc.cases[12].expect).toBeNull();
    expect(doc.cases[13].rule.allDay).toBe(true);
    expect(doc.cases[13].notificationTime).toBe("09:00");
    for (const item of doc.cases) {
      if (item.expect === null) continue;
      expect(item.expect.length).toBeGreaterThan(0);
      for (const instant of item.expect) {
        expect(instant).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000(Z|[+-]\d{2}:\d{2})$/);
      }
    }
  });
});
