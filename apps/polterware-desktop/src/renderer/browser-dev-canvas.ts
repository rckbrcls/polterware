import type { PolterwareBridge } from "../preload/bridge.js";
import type { JsonObject } from "../shared/ipc.js";

/** In-memory demonstration data; never claims to be persisted in the local core. */
export function createBrowserCanvas(): PolterwareBridge["core"]["canvas"] {
  const definition = (type: string, label: string, nodeKinds: string[], edgeKinds: string[], rules: string[] = []) => ({
    type, label, nodeKinds: [...nodeKinds, "note", "text"], edgeKinds, rules, unrestricted: type === "free",
  });
  const annotations = "Note and text nodes are always allowed and skip structural rules.";
  const ideaRules = ["Nodes are idea or group.", "Edges are relates or contains.", annotations];
  const types = [
    definition("free", "Free", [], []),
    definition("architecture", "Architecture", ["system", "domain", "component", "service", "database", "queue"], ["uses", "contains"], ["Nodes are system, domain, component, service, database, or queue.", "Each of those nodes refs a structure node.", "Edges are uses or contains.", annotations]),
    definition("roadmap", "Roadmap", ["lane", "milestone", "item"], ["depends_on", "precedes"], ["Nodes are lane, milestone, or item.", "An item has start and end, or a quarter.", "Edges are depends_on or precedes.", annotations]),
    definition("flow", "Flow", ["step", "decision", "start", "end"], ["next"], ["Nodes are step, decision, start, or end.", "Edges are next.", annotations]),
    definition("brainstorm", "Brainstorm", ["idea", "group"], ["relates", "contains"], ideaRules),
    definition("ideas", "Ideas", ["idea", "group"], ["relates", "contains"], ideaRules),
  ];
  const node = (id: string, kind: string, label: string, props: JsonObject = {}, ref?: JsonObject): JsonObject => ({ id, kind, label, propsJson: JSON.stringify(props), ...(ref ? { ref } : {}) });
  const edge = (id: string, from: string, to: string, kind: string, props: JsonObject = {}): JsonObject => ({ id, from, to, kind, propsJson: JSON.stringify(props) });
  const samples: Record<string, { nodes: JsonObject[]; edges: JsonObject[] }> = {
    free: { nodes: [node("sketch", "rectangle", "A shared sketch")], edges: [] },
    architecture: { nodes: [node("core", "component", "Core", {}, { kind: "node", id: "comp-core" }), node("cli", "component", "CLI", {}, { kind: "node", id: "comp-cli" })], edges: [edge("uses", "cli", "core", "uses")] },
    roadmap: { nodes: [node("delivery", "lane", "Delivery"), node("build", "item", "Build", { lane: "delivery", start: "2026-10-01", end: "2026-10-15", status: "In progress" }), node("ship", "milestone", "Ship", { lane: "delivery", start: "2026-10-20", status: "Planned" })], edges: [edge("dependency", "ship", "build", "depends_on")] },
    flow: { nodes: [node("start", "start", "Start"), node("check", "decision", "Ready?"), node("work", "step", "Revise"), node("end", "end", "Done")], edges: [edge("begin", "start", "check", "next"), edge("yes", "check", "end", "next", { label: "Yes" }), edge("no", "check", "work", "next", { label: "No" })] },
    brainstorm: { nodes: [node("cluster", "group", "Explore"), node("idea", "idea", "Try a small experiment", { color: "yellow" })], edges: [edge("contains", "cluster", "idea", "contains")] },
    ideas: { nodes: [node("idea", "idea", "An idea to investigate", { color: "blue" }), node("next", "idea", "A related direction", { color: "green" })], edges: [edge("related", "idea", "next", "relates")] },
  };
  let canvases: JsonObject[] = types.map((type, index) => {
    const graph = samples[type.type]!;
    const nodes = [...graph.nodes, node("welcome", "note", "Demonstration only — edits last for this browser session.")];
    return {
      id: `preview-canvas-${index}`, projectId: "browser-preview", name: `Demo ${type.label.toLowerCase()}`, type: type.type,
      agentVisible: type.type === "brainstorm", graph: { ...graph, nodes },
      layoutJson: JSON.stringify({ version: 1, nodes: Object.fromEntries(nodes.map((node, i) => [String(node.id), {
        x: 40 + (i % 3) * 300, y: 40 + Math.floor(i / 3) * 220, width: node.kind === "group" ? 640 : node.kind === "decision" ? 240 : 280, height: node.kind === "group" ? 300 : node.kind === "decision" ? 180 : 120,
      }])) }), scopeNodeId: "", createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z",
    };
  });
  const clone = <T,>(value: T): T => structuredClone(value);
  function find(args: JsonObject) {
    const canvas = canvases.find((item) => item.id === args.id && item.projectId === args.projectId);
    if (!canvas) throw new Error("Canvas not found in this project.");
    return canvas;
  }
  const propSet = (value: unknown) => value !== undefined && value !== null && (typeof value !== "string" || !!value.trim());
  function validate(canvas: JsonObject) {
    if (!String(canvas.name ?? "").trim()) throw new Error("Canvas name is required.");
    const type = types.find((type) => type.type === canvas.type);
    if (!type) throw new Error("Unknown canvas type.");
    JSON.parse(String(canvas.layoutJson));
    const graph = canvas.graph as { nodes: JsonObject[]; edges: JsonObject[] };
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("Invalid canvas graph.");
    const ids = new Set<string>(); const edgeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (!node.id || ids.has(String(node.id))) throw new Error(`nodes[${index}]: unique id is required`);
      ids.add(String(node.id));
      if (!node.kind || (!type.unrestricted && !type.nodeKinds.includes(String(node.kind)))) throw new Error(`nodes[${index}]: kind is not allowed`);
      if (node.ref) {
        const ref = node.ref as JsonObject;
        if (!["card", "decision", "fact", "evidence", "node"].includes(String(ref.kind)) || !ref.id) throw new Error(`nodes[${index}]: invalid reference`);
      }
      if (node.kind === "note" || node.kind === "text" || type.unrestricted) return;
      if (type.type === "architecture" && ((node.ref as JsonObject)?.kind !== "node" || !(node.ref as JsonObject)?.id)) throw new Error(`nodes[${index}]: requires a ref to a structure node`);
      const props = JSON.parse(String(node.propsJson || "{}"));
      if (type.type === "roadmap" && node.kind === "item" && !propSet(props.quarter) && !(propSet(props.start) && propSet(props.end))) throw new Error(`nodes[${index}]: item requires start and end, or a quarter`);
    });
    graph.edges.forEach((edge, index) => {
      if (!edge.id || edgeIds.has(String(edge.id))) throw new Error(`edges[${index}]: unique id is required`);
      edgeIds.add(String(edge.id));
      if (!ids.has(String(edge.from)) || !ids.has(String(edge.to))) throw new Error(`edges[${index}]: endpoints must match nodes`);
      if (!edge.kind || (!type.unrestricted && !type.edgeKinds.includes(String(edge.kind)))) throw new Error(`edges[${index}]: kind is not allowed`);
    });
  }
  return {
    listCanvasTypes: async () => ({ types: clone(types) }),
    listCanvases: async (args = {}) => ({ canvases: clone(canvases.filter((item) => item.projectId === args.projectId)) }),
    getCanvas: async (args = {}) => ({ canvas: clone(find(args)) }),
    createCanvas: async (args = {}) => {
      const now = new Date().toISOString();
      const canvas: JsonObject = { id: crypto.randomUUID(), projectId: String(args.projectId ?? ""), name: String(args.name ?? "").trim(), type: args.type ?? "",
        agentVisible: args.agentVisible === true, graph: args.graph ?? { nodes: [], edges: [] }, layoutJson: args.layoutJson ?? "{}", scopeNodeId: "", createdAt: now, updatedAt: now };
      validate(canvas); canvases.push(clone(canvas)); return { canvas: clone(canvas) };
    },
    updateCanvas: async (args = {}) => {
      const canvas = clone(find(args));
      for (const key of ["name", "agentVisible", "graph", "layoutJson"] as const) if (args[key] !== undefined) canvas[key] = clone(args[key]);
      canvas.updatedAt = new Date().toISOString(); validate(canvas);
      canvases = canvases.map((item) => item.id === canvas.id ? canvas : item); return { canvas: clone(canvas) };
    },
    deleteCanvas: async (args = {}) => { const canvas = find(args); canvases = canvases.filter((item) => item.id !== canvas.id); return {}; },
  };
}
