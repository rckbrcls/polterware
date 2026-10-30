import { describe, expect, it } from "vitest";
import { createBrowserStructure } from "./browser-dev-structure";

const text = (path: string, level: string, under?: string) => `---\npolter: 1\nsummary: Update structure\nrationale: Organize project\n---\n\n# ${path}: ${path}\nlevel: ${level}${under ? ` · under: ${under}` : ""}\n`;

describe("browser Structure persistence", () => {
  it("creates nodes in an empty project and moves descendants", () => {
    const store = createBrowserStructure("seed", []);
    store.apply("empty", text("system", "system"));
    store.apply("empty", text("first", "domain", "system"));
    store.apply("empty", text("second", "system"));
    store.apply("empty", text("api", "component", "system/first"));
    store.apply("empty", text("client", "component", "second"));
    store.apply("empty", text("system/first", "domain", "second"));
    const nodes = store.list("empty").nodes;
    expect(nodes.find((node) => node.slug === "api")?.path).toBe("second/first/api");
    expect(nodes.find((node) => node.slug === "first")?.parentId).toBe(nodes.find((node) => node.slug === "second")?.id);
    expect(store.list("seed").nodes).toEqual([]);
  });
  it("keeps dry runs, invalid hierarchy and returned snapshots from mutating the store", () => {
    const store = createBrowserStructure("seed", []);
    store.apply("empty", text("system", "system"), true);
    expect(store.list("empty").nodes).toEqual([]);
    expect(() => store.apply("empty", text("domain", "domain"))).toThrow("parent");
    store.apply("empty", text("system", "system"));
    expect(() => store.apply("empty", text("bad", "component", "missing"))).toThrow("Parent not found");
    const snapshot = store.list("empty");
    snapshot.nodes[0]!.title = "Mutated snapshot";
    expect(store.list("empty").nodes[0]!.title).toBe("system");
    expect(store.list("other").nodes).toEqual([]);
  });
});
