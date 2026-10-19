import { describe, expect, it } from "vitest";
// @ts-expect-error Vite resolves raw source imports in the Vitest transform.
import source from "./architecture-canvas-host.tsx?raw";

describe("ArchitectureCanvasHost", () => {
  it("uses a semantic relationship-type icon control instead of a text badge", () => {
    expect(source).toContain("RelationshipTypeIcon");
    expect(source).toContain("<RelationshipTypeIcon type={r.type} size={14} />");
    expect(source).not.toMatch(
      />\s*\{labelForRelType\(r\.type\)\}\s*<\/DropdownMenuTrigger>/,
    );
    expect(source).toContain("architecture-canvas-rel-control rounded-full");

    // Proves accessible menu trigger + short type tooltip
    expect(source).toContain(
      "aria-label={`Change relationship type. Current: ${labelForRelType(r.type)}`}",
    );
    expect(source).toContain("Tooltip.Root");
    expect(source).toContain("<Tooltip.Content>");
    expect(source).toContain("{labelForRelType(r.type)}");

    // Proves updateRelationship wiring (type menu on midpoint control)
    expect(source).toContain("updateRelationship(props.document, r.id,");
    expect(source).toContain("type: type.id");
  });

  it("creates the edge immediately on connect and opens the midpoint type menu", () => {
    expect(source).toContain("setRelTypeMenuId(created.id)");
    expect(source).toContain("relTypeMenuId");
    expect(source).not.toContain("setPendingRel");
    expect(source).not.toContain("RelationshipTypePopover");
    // Recommended draft snaps to the hovered target node (solid edge).
    expect(source).toContain("snapTarget");
    expect(source).toContain("stroke-dasharray={snapTarget ? undefined : \"4 3\"}");
    // Midpoint control stacks above nodes/handles so the dropdown is clickable.
    expect(source).toContain('class="absolute z-[4]"');
  });

  it("differentiates empty click from real marquee without intermediate null selection", () => {
    const pointerDown = source.slice(
      source.indexOf("function onPointerDown"),
      source.indexOf("function onPointerMove"),
    );
    const pointerUp = source.slice(
      source.indexOf("function onPointerUp"),
      source.indexOf("function onWheel"),
    );

    expect(pointerDown).toContain('dragMode = "marquee"');
    expect(pointerDown).not.toContain("props.onSelect(null)");
    expect(pointerUp).toMatch(
      /if \(dragMode === "marquee"\)[\s\S]*setSel\(s\);[\s\S]*props\.onSelect\(s\.nodeIds\[0\] \?\? null\);/,
    );
    expect(pointerUp.indexOf("setSel(s)")).toBeLessThan(
      pointerUp.indexOf("props.onSelect(s.nodeIds[0] ?? null)"),
    );
  });

  it("uses transient node drag rAF coalescing and exactly one document/history commit", () => {
    const pointerMove = source.slice(
      source.indexOf("function onPointerMove"),
      source.indexOf("function onPointerUp"),
    );
    const pointerUp = source.slice(
      source.indexOf("function onPointerUp"),
      source.indexOf("function onWheel"),
    );
    const moveNodes = pointerMove.match(
      /if \(dragMode === "nodes"\) \{[\s\S]*?\n    \}/,
    )?.[0] ?? "";
    const upNodes = pointerUp.match(
      /if \(dragMode === "nodes"\) \{[\s\S]*?setNodeDragOffset\(null\);[\s\S]*?\n    \}/,
    )?.[0] ?? "";

    expect(moveNodes).toContain("requestAnimationFrame");
    expect(moveNodes).toContain("setNodeDragOffset(nextDragOffset)");
    expect(moveNodes).not.toContain("applyDoc(");
    // Pointer-up commits a moved drag through commitNodeDrag, which applies one document update.
    expect(upNodes).not.toContain("applyDoc(");
    expect(upNodes).toContain("commitNodeDrag(off)");
    const commitNodeDrag = source.slice(
      source.indexOf("function commitNodeDrag"),
      source.indexOf("function springDragHome"),
    );
    expect(commitNodeDrag.match(/applyDoc\(/g)).toHaveLength(1);
    expect(commitNodeDrag).toMatch(/applyDoc\([\s\S]*?"immediately",\s*\)/);
  });

  it("ensures no idle edge-flow rAF and preserves distance on pause/resume", () => {
    expect(source).toContain("document.visibilityState === \"visible\"");
    expect(source).toContain("flowDots.size > 0");
    expect(source).toContain("if (flowDots.size === 0)");
    expect(source).toContain("flowPhases.get(id)");
    expect(source).toContain("flowPhases.set(id, nextDist)");
    expect(source).toContain("cancelAnimationFrame(flowRaf)");
    expect(source).toContain("nextEdgeFlowDistance");
    expect(source).toContain("relationshipIds()");
    expect(source).not.toContain("onCleanup(() => flowPhases.delete");
  });

  it("computes modular grid phase and overscan", () => {
    expect(source).toContain("GRID_SPACING = 12");
    expect(source).toContain("GRID_OVERSCAN = GRID_SPACING * MAX_ZOOM");
    expect(source).toContain("transform: `translate3d(${gridPhase(vp().x)}px, ${gridPhase(vp().y)}px, 0)`");
    expect(source).toContain('"background-size": `${gridSize()}px ${gridSize()}px`');
  });

  it("uses the approved cancelable spatial tween only for minimap and visual fit", () => {
    expect(source).toContain("const progress = Math.min(Math.max(elapsed / 200, 0), 1)");
    expect(source).toContain("* 0.77");
    expect(source).toContain("* 0.175");
    expect(source).toContain("if (prefersReducedMotion())");
    expect(source).toContain("onNavigate={(nx, ny) => tweenTo({ ...vp(), x: nx, y: ny })}");
    expect(source).toContain('value="fit" onSelect={() => { fitDoc(true); }}');
    expect(source).toContain("fitDoc(false)");
    expect(source).toMatch(/function onPointerDown[\s\S]*?cancelTween\(\);/);
    expect(source).toMatch(/function onWheel[\s\S]*?cancelTween\(\);/);
  });
});
