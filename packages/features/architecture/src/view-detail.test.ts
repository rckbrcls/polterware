import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIEW_FIXTURES, type ArchViewCard } from "./extra-fixtures";
import {
  emptyDescriptionCopy,
  hasMembershipList,
  isDescriptionEmpty,
  isViewEnriched,
  membershipEmptyCopy,
  membershipRows,
} from "./view-detail-helpers";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(root, "view-detail.tsx"), "utf8");
const helpersSource = readFileSync(resolve(root, "view-detail-helpers.ts"), "utf8");
const architectureIndex = readFileSync(resolve(root, "index.tsx"), "utf8");

describe("ArchitectureViewDetail helpers", () => {
  it("treats members array as known membership and never invents from nodeCount", () => {
    expect(hasMembershipList({ members: [] })).toBe(true);
    expect(hasMembershipList({ members: [{ id: "n-pay", name: "Payment Service" }] })).toBe(
      true,
    );
    expect(hasMembershipList({ members: undefined })).toBe(false);
    expect(hasMembershipList({})).toBe(false);
    expect(membershipRows({ members: undefined })).toEqual([]);
    expect(membershipEmptyCopy({ nodeCount: 12 })).toBe(
      "Membership has not been recorded for this view.",
    );
    expect(membershipEmptyCopy({ nodeCount: 0, members: [] })).toBe("No members in this view.");
    expect(membershipEmptyCopy({ nodeCount: 2, members: [{ id: "a", name: "A" }] })).toBe("");
    // Helpers must not synthesize placeholder names from nodeCount.
    expect(helpersSource).not.toMatch(/Node \$\{|`Node \d|Array\.from\(\s*\{\s*length:\s*nodeCount/);
  });

  it("detects empty description and enrichment", () => {
    expect(isDescriptionEmpty("")).toBe(true);
    expect(isDescriptionEmpty("  ")).toBe(true);
    expect(isDescriptionEmpty("Checkout")).toBe(false);
    expect(emptyDescriptionCopy()).toBe("No description provided for this view.");

    const sparse: ArchViewCard = {
      id: "v-sparse",
      name: "Sparse",
      description: "Only baseline",
      nodeCount: 3,
      updated: "1d ago",
    };
    expect(isViewEnriched(sparse)).toBe(false);
    expect(isViewEnriched(VIEW_FIXTURES.find((v) => v.id === "v-pay")!)).toBe(true);
    expect(isViewEnriched(VIEW_FIXTURES.find((v) => v.id === "v-system")!)).toBe(true);
  });
});

describe("ArchitectureViewDetail composition contract", () => {
  it("uses the record layout with contextual Open, Edit, and Delete actions", () => {
    expect(source).toContain("DetailPanel.Main");
    expect(source).toContain("DetailPanel.Rail");
    expect(source).not.toContain("DetailPanel.Metric");
    expect(source).toContain("DetailPanel.Title");
    expect(source).toContain('>Open</Button>');
    expect(source).toContain("Edit view");
    expect(source).toMatch(/Button variant="danger"[\s\S]*?Delete view/);
    expect(source).not.toContain('tone="danger"');
    expect(source).toContain("PageLoading");
    expect(source).toContain('layout="detail"');
    expect(source).toContain("PageError");
    expect(source).toContain("View not found");
    expect(source).toContain('title="Overview"');
    expect(source).toContain('title="Membership"');
    expect(source).toContain("membershipEmptyCopy");
    expect(source).toContain("emptyDescriptionCopy");
    expect(source).toContain("No members in this view.");
    expect(helpersSource).not.toContain("mock");
    expect(helpersSource).toContain("No description provided for this view.");
    expect(source).toContain('aria-label="View members"');
    expect(source).toContain("DataTable.Root");
    expect(source).toContain('title="Filters"');
    expect(source).toContain('title="Notes"');
    expect(source).not.toContain("description=");
  });

  it("stays exported from the Architecture entry after the Views tab was retired", () => {
    expect(architectureIndex).toContain('export { ArchitectureViewDetail } from "./view-detail"');
    expect(architectureIndex).not.toContain("<ArchitectureViewDetail");
  });
});

describe("VIEW_FIXTURES enrichment", () => {
  it("enriches at least two primary views beyond baseline fields", () => {
    const enriched = VIEW_FIXTURES.filter(isViewEnriched);
    expect(enriched.length).toBeGreaterThanOrEqual(2);

    const system = VIEW_FIXTURES.find((v) => v.id === "v-system");
    const pay = VIEW_FIXTURES.find((v) => v.id === "v-pay");
    expect(system?.members?.length).toBeGreaterThan(0);
    expect(pay?.members?.length).toBeGreaterThan(0);
    expect(system?.owner).toBeTruthy();
    expect(pay?.owner).toBeTruthy();
    expect(system?.environments?.length).toBeGreaterThan(0);
    expect(pay?.tags?.length).toBeGreaterThan(0);

    // Sparse / unavailable membership path exists (no invented members).
    const withoutMembers = VIEW_FIXTURES.filter((v) => !hasMembershipList(v));
    expect(withoutMembers.length).toBeGreaterThan(0);
    expect(withoutMembers.every((v) => v.nodeCount >= 0)).toBe(true);
  });

  it("does not invent member names when only nodeCount is present", () => {
    for (const view of VIEW_FIXTURES) {
      if (!hasMembershipList(view)) {
        expect(view.members).toBeUndefined();
      } else {
        for (const member of view.members ?? []) {
          expect(member.id).toBeTruthy();
          expect(member.name).toBeTruthy();
          expect(member.name).not.toMatch(/^Node \d+$/);
        }
      }
    }
  });
});
