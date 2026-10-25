import type { PolterwareBridge } from "../preload/bridge.js";
import type { JsonObject } from "../shared/ipc.js";

/** In-memory demonstration data; never claims to be persisted in the local core. */
export function createBrowserCanvas(): PolterwareBridge["core"]["canvas"] {
  const definition = (type: string, label: string, nodeKinds: string[], edgeKinds: string[], rules: string[] = []) => ({
    type, label, nodeKinds: [...nodeKinds, "note", "text"], edgeKinds, rules, unrestricted: type === "free",
  });
  const types = [
    definition("free", "Free", [], []),
    definition("architecture", "Architecture", ["system", "domain", "component", "service", "database", "queue"], ["uses", "contains"], ["Structural nodes require a reference to an Atlas node. Note and text do not."]),
    definition("roadmap", "Roadmap", ["lane", "milestone", "item"], ["depends_on", "precedes"], ["An item requires start and end, or a quarter."]),
    definition("flow", "Flow", ["step", "decision", "start", "end"], ["next"]),
    definition("brainstorm", "Brainstorm", ["idea", "group"], ["relates", "contains"]),
    definition("ideas", "Ideas", ["idea", "group"], ["relates", "contains"]),
  ];
  let canvases: JsonObject[] = ["free", "brainstorm"].map((type, index) => ({
    id: `preview-canvas-${index}`, projectId: "browser-preview", name: index ? "Demo brainstorming" : "Demo sketch", type,
    agentVisible: index === 1, graph: { nodes: [{ id: "welcome", kind: "note", label: "Demonstration only — edits last for this browser session.", propsJson: "{}" }], edges: [] },
    layoutJson: JSON.stringify({ version: 1, nodes: { welcome: { x: 40, y: 40, width: 280, height: 120 } } }), scopeNodeId: "",
    createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z",
  }));
  const clone = <T,>(value: T): T => structuredClone(value);
  function find(args: JsonObject) {
    const canvas = canvases.find((item) => item.id === args.id && item.projectId === args.projectId);
    if (!canvas) throw new Error("Canvas not found in this project.");
    return canvas;
  }
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
      if (node.kind === "note" || node.kind === "text" || type.unrestricted) return;
      if (type.type === "architecture" && !(node.ref as JsonObject)?.id) throw new Error(`nodes[${index}]: requires a ref to a structure node`);
      const props = JSON.parse(String(node.propsJson || "{}"));
      if (type.type === "roadmap" && node.kind === "item" && !props.quarter && !(props.start && props.end)) throw new Error(`nodes[${index}]: item requires start and end, or a quarter`);
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
