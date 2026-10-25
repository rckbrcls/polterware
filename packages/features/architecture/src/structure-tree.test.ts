import { describe, expect, it } from "vitest";
import { buildStructureTree, filterStructureNodes, flattenStructureTree, structureParents, type StructureNode } from "./structure-tree";

const node = (id: string, level: StructureNode["level"], parentId = ""): StructureNode => ({ id, parentId, level, path: id, title: id, intent: "", repo: "", decisions: [] });
const nodes = [node("system", "system"), node("domain", "domain", "system"), node("api", "component", "domain"), node("cli", "component", "system")];

describe("Structure tree", () => {
  it("builds system > domain > component, including components directly under a system", () => {
    const roots = buildStructureTree(nodes);
    expect(roots.map((item) => item.node.id)).toEqual(["system"]);
    expect(roots[0]!.children.map((item) => item.node.id)).toEqual(["domain", "cli"]);
    expect(roots[0]!.children[0]!.children[0]!.node.id).toBe("api");
    expect(flattenStructureTree(roots).map((item) => item.id)).toEqual(["system", "domain", "api", "cli"]);
  });
  it("preserves ancestors during search and descendants when a branch matches", () => {
    expect(flattenStructureTree(buildStructureTree(nodes, "API")).map((item) => item.id)).toEqual(["system", "domain", "api"]);
    expect(flattenStructureTree(buildStructureTree(nodes, "domain")).map((item) => item.id)).toEqual(["system", "domain", "api"]);
    expect(buildStructureTree(nodes, "missing")).toEqual([]);
  });
  it("preserves orphan nodes and handles malformed cycles without dropping or duplicating records", () => {
    const malformed = [node("orphan", "component", "gone"), node("a", "domain", "b"), node("b", "domain", "a"), node("self", "system", "self")];
    expect(flattenStructureTree(buildStructureTree(malformed)).map((item) => item.id)).toEqual(["orphan", "a", "b", "self"]);
    expect(buildStructureTree([])).toEqual([]);
  });
  it("narrows scope to subtree unions while keeping their ancestors", () => {
    expect(filterStructureNodes(nodes, ["domain"]).map((item) => item.id)).toEqual(["system", "domain", "api"]);
    expect(filterStructureNodes(nodes, ["api", "cli"]).map((item) => item.id)).toEqual(["system", "domain", "api", "cli"]);
    expect(filterStructureNodes(nodes, [])).toEqual(nodes);
    expect(filterStructureNodes(nodes, ["missing"])).toEqual([]);
  });
  it("offers valid hierarchy parents for creation and movement", () => {
    expect(structureParents(nodes, "system")).toEqual([]);
    expect(structureParents(nodes, "domain", "domain").map((item) => item.id)).toEqual(["system"]);
    expect(structureParents(nodes, "component", "api").map((item) => item.id)).toEqual(["system", "domain"]);
  });
});
