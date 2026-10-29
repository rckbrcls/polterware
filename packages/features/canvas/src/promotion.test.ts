import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertApplied, createdDecisionTitle, createdFactId, deriveSlug, promotionText } from "./promotion";
const input = { kind: "card" as const, title: "Local core", slug: "local-core", canvasName: "Sketch" };
describe("canvas promotion Polter", () => {
  it("derives deterministic valid slugs and avoids existing card identities", () => {
    expect(deriveSlug("  Ação: café! ")).toBe("acao-cafe");
    expect(deriveSlug("!!!")).toBe("canvas-item");
    expect(deriveSlug("a".repeat(200)).length).toBeLessThanOrEqual(80);
    expect(deriveSlug("Local core", ["local-core", "local-core-2"])).toBe("local-core-3");
  });
  it("emits the card and proposed Decision forms accepted by backend Polter fixtures", () => {
    // These fixtures exercise Decode/Lint/Plan in Go. Keep our emitted grammar aligned.
    const fixture = readFileSync("../../../backend/domains/polter/decisions_test.go", "utf8");
    const codec = readFileSync("../../../backend/domains/polter/decode.go", "utf8");
    expect(fixture).toContain("### new: Local core");
    expect(codec).toContain('"polter": true, "summary": true, "rationale": true');
    expect(promotionText(input)).toBe("---\npolter: 1\nsummary: Promote canvas item: Local core\nrationale: Promoted from canvas Sketch.\n---\n\n## local-core: Local core\nstage: shape\n");
    expect(promotionText({ ...input, kind: "decision" })).toContain("### new: Local core\nstatus: proposed\n");
    expect(codec).toContain('DecisionNewRef = "new"');
    expect(codec).toContain('"stage", "owner", "under", "milestone", "decisions", "status", "kind"');
  });
  it("prevents heading/frontmatter injection and rejects invalid slugs for cards and Facts", () => {
    const text = promotionText({ ...input, title: "A\n### new: B", canvasName: "Sketch\n---\n## injected" });
    expect(text.match(/^### /gm)).toBeNull();
    expect(text.match(/^---$/gm)).toHaveLength(2);
    expect(() => promotionText({ ...input, slug: "bad\nstage: delivered" })).toThrow("slug");
    expect(() => promotionText({ ...input, title: " " })).toThrow("Title");
    expect(() => promotionText({ ...input, kind: "fact", slug: "bad\nkind: verified" })).toThrow("slug");
  });
  it("emits declared Facts and resolves their exact created ID", () => {
    const text = promotionText({ ...input, kind: "fact" });
    expect(text).toContain("#### local-core: Local core\nkind: declared\n");
    expect(text).toContain("rationale: promoted from canvas Sketch\n");
    expect(readFileSync("../../../backend/domains/polter/facts_test.go", "utf8")).toContain("#### local-core: Local core");
    expect(createdFactId(['+ fact fact-123 "Local core"'])).toBe("fact-123");
    expect(() => createdFactId([])).toThrow("identity");
  });
  it("surfaces diagnostics and reads the server-assigned Decision identity", () => {
    expect(() => assertApplied({ applied: false, diagnostics: [{ severity: "error", message: "Core refused" }] })).toThrow("Core refused");
    expect(() => assertApplied({})).toThrow("did not apply");
    expect(() => assertApplied({ applied: true })).not.toThrow();
    expect(createdDecisionTitle(['+ decision Decision 0005: A "Decision 0005: A"'])).toBe("Decision 0005: A");
    expect(createdDecisionTitle(['+ decision Decision 0005: Say "hi" "Decision 0005: Say \\"hi\\""'])).toBe('Decision 0005: Say "hi"');
    expect(() => createdDecisionTitle([])).toThrow("identity");
  });
});
