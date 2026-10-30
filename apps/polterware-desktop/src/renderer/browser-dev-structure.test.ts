import { describe, expect, it } from "vitest";
import { createBrowserStructure } from "./browser-dev-structure";

const text = (path: string, level: string, under?: string) => `---\npolter: 1\nsummary: Update structure\nrationale: Organize project\n---\n\n# ${path}: ${path}\nlevel: ${level}${under ? ` · under: ${under}` : ""}\n`;

describe("browser Structure persistence", () => {
  it("creates nodes in an empty project and moves components between domains", () => {
    const store = createBrowserStructure("seed", []);
    store.apply("empty", text("first", "domain"));
    store.apply("empty", text("second", "domain"));
    store.apply("empty", text("api", "component", "first"));
    store.apply("empty", text("cli", "component"));
    store.apply("empty", text("first/api", "component", "second"));
    const nodes = store.list("empty").nodes;
    expect(nodes.find((node) => node.slug === "api")?.path).toBe("second/api");
    expect(nodes.find((node) => node.slug === "api")?.parentId).toBe(nodes.find((node) => node.slug === "second")?.id);
    expect(nodes.find((node) => node.slug === "cli")).toMatchObject({ path: "cli", parentId: "" });
    expect(store.list("seed").nodes).toEqual([]);
  });
  it("keeps dry runs, invalid hierarchy and returned snapshots from mutating the store", () => {
    const store = createBrowserStructure("seed", []);
    store.apply("empty", text("core", "domain"), true);
    expect(store.list("empty").nodes).toEqual([]);
    expect(() => store.apply("empty", text("system", "system"))).toThrow("Invalid structure kind");
    store.apply("empty", text("core", "domain"));
    expect(() => store.apply("empty", text("sub", "domain", "core"))).toThrow("parent");
    expect(() => store.apply("empty", text("bad", "component", "missing"))).toThrow("Parent not found");
    const snapshot = store.list("empty");
    snapshot.nodes[0]!.title = "Mutated snapshot";
    expect(store.list("empty").nodes[0]!.title).toBe("core");
    expect(store.list("other").nodes).toEqual([]);
  });
});
