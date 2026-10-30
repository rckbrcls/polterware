import { describe, expect, it } from "vitest";
import { buildStructureTree, filterStructureNodes, flattenStructureTree, structureParents, type StructureNode } from "./structure-tree";

const node = (id: string, level: StructureNode["level"], parentId = ""): StructureNode => ({ id, parentId, level, path: id, title: id, intent: "", repo: "", decisions: [] });
const nodes = [node("core", "domain"), node("api", "component", "core"), node("cli", "component")];

describe("Structure tree", () => {
  it("builds domain > component, with components loose under the project", () => {
    const roots = buildStructureTree(nodes);
    expect(roots.map((item) => item.node.id)).toEqual(["core", "cli"]);
    expect(roots[0]!.children.map((item) => item.node.id)).toEqual(["api"]);
    expect(flattenStructureTree(roots).map((item) => item.id)).toEqual(["core", "api", "cli"]);
  });
  it("preserves ancestors during search and descendants when a branch matches", () => {
    expect(flattenStructureTree(buildStructureTree(nodes, "API")).map((item) => item.id)).toEqual(["core", "api"]);
    expect(flattenStructureTree(buildStructureTree(nodes, "core")).map((item) => item.id)).toEqual(["core", "api"]);
    expect(buildStructureTree(nodes, "missing")).toEqual([]);
  });
  it("filters to the nodes that match, with only the ancestors that lead to them", () => {
    const components = buildStructureTree(nodes, "", (item) => item.level === "component");
    expect(flattenStructureTree(components).map((item) => item.id)).toEqual(["core", "api", "cli"]);
    const domains = buildStructureTree(nodes, "", (item) => item.level === "domain");
    expect(flattenStructureTree(domains).map((item) => item.id)).toEqual(["core"]);
    expect(flattenStructureTree(buildStructureTree(nodes, "cli", (item) => item.level === "component")).map((item) => item.id)).toEqual(["cli"]);
  });
  it("preserves orphan nodes and handles malformed cycles without dropping or duplicating records", () => {
    const malformed = [node("orphan", "component", "gone"), node("a", "domain", "b"), node("b", "domain", "a"), node("self", "domain", "self")];
    expect(flattenStructureTree(buildStructureTree(malformed)).map((item) => item.id)).toEqual(["orphan", "a", "b", "self"]);
    expect(buildStructureTree([])).toEqual([]);
  });
  it("narrows scope to subtree unions while keeping their ancestors", () => {
    expect(filterStructureNodes(nodes, ["core"]).map((item) => item.id)).toEqual(["core", "api"]);
    expect(filterStructureNodes(nodes, ["api", "cli"]).map((item) => item.id)).toEqual(["core", "api", "cli"]);
    expect(filterStructureNodes(nodes, [])).toEqual(nodes);
    expect(filterStructureNodes(nodes, ["missing"])).toEqual([]);
  });
  it("offers domains as the only parents, for components", () => {
    expect(structureParents(nodes, "domain")).toEqual([]);
    expect(structureParents(nodes, "component", "api").map((item) => item.id)).toEqual(["core"]);
  });
});
