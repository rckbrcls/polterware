import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { COMPONENTS, FAMILIES } from "./components";
import type { CanvasType } from "./model";
import { SHAPES, paletteGroups } from "./shapes";
import { ShapeGallery, galleryKinds } from "./shape-gallery";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
});

const definition: CanvasType = { type: "canvas", label: "Canvas", nodeKinds: ["note", "text", "future-kind"], edgeKinds: ["depends_on", "contains"], rules: [], unrestricted: true };
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); document.body.innerHTML = ""; });

describe("ShapeGallery", () => {
  it("lists every library kind plus kinds the core reports", () => {
    const kinds = galleryKinds([definition]);
    for (const kind of [...SHAPES.map((item) => item.kind), ...COMPONENTS.map((item) => item.kind), "system", "domain", "component", "note", "text", "future-kind"]) {
      expect(kinds.nodes).toContain(kind);
    }
    expect(kinds.edges).toEqual(["relates", "depends_on", "contains"]);
  });

  it("draws every component family, library entry and connection on the grid", () => {
    const container = document.body.appendChild(document.createElement("div"));
    cleanup = render(() => <ShapeGallery types={[definition]} onBack={() => {}} />, container);
    const { nodes, edges } = galleryKinds([definition]);
    const entries = paletteGroups(nodes).flatMap((group) => group.kinds);
    // Connections are one entry; the kind is picked in the inspector.
    expect(container.querySelectorAll(".pw-canvas-gallery-tile")).toHaveLength(entries.length + 1);
    expect(container.querySelector('ul[aria-label="Connections"]')?.textContent).toContain(`${edges.length} kinds`);
    // A note is a borderless sticky note.
    expect(container.querySelector('[data-variant="sticky"] [data-note] path[data-face]')?.getAttribute("stroke")).toBeNull();
    // One generic component per family, each in its own silhouette.
    expect([...container.querySelectorAll('ul[aria-label="Components"] [data-variant="component"]')].map((node) => node.getAttribute("data-family"))).toEqual(FAMILIES.map((item) => item.id));
    expect(container.querySelector('ul[aria-label="Components"] li')?.textContent).toContain("4 types");
    expect(container.querySelector('[data-shape="cylinder"]')).not.toBeNull();
    // Faces fill closed outlines only; an open lid would punch a hole through the cylinder.
    for (const face of container.querySelectorAll('[data-shape="cylinder"] path[data-face], [data-family="storage"] path[data-face]')) {
      expect(face.getAttribute("d")!.split(/(?=M)/).every((part) => /Z\s*$/.test(part))).toBe(true);
    }
    expect(container.querySelector('section[aria-label="Other"]')?.textContent).toContain("future-kind");
  });
});
