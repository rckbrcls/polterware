import type { PolterwareBridge } from "../preload/bridge.js";
import type { JsonObject } from "../shared/ipc.js";

/** In-memory demonstration data; never claims to be persisted in the local core. */
export function createBrowserCanvas(): PolterwareBridge["core"]["canvas"] {
  // Mirrors canvas.ShapeKinds, canvas.ComponentKinds, canvas.StructureKinds, and canvas.EdgeKinds in the core.
  const shapes = ["rectangle", "rounded", "square", "ellipse", "circle", "diamond", "triangle", "hexagon", "parallelogram", "trapezoid",
    "cylinder", "cloud", "document", "actor", "callout", "process", "terminator", "predefined", "manual-input", "delay", "display", "frame"];
  const components = ["frontend", "mobile", "desktop", "cli", "service", "api", "gateway", "worker", "function", "scheduler",
    "database", "cache", "queue", "stream", "storage", "search", "warehouse", "auth", "cdn", "cluster", "monitoring",
    "external", "llm", "payment", "email", "user", "team",
    "agent", "mcp", "vector", "secrets", "firewall", "kms", "logs", "tracing", "alerting", "pipeline", "ci", "webhook", "config", "spec", "dataset"];
  const structure = ["system", "domain", "component"];
  const types = [{
    type: "canvas", label: "Canvas", nodeKinds: [...components, ...structure, ...shapes, "note", "text"],
    edgeKinds: ["relates", "flows", "uses", "calls", "reads", "writes", "publishes", "subscribes", "depends_on", "contains"],
    rules: ["Components may carry a technology and an optional ref to a structure node.", "System, domain, and component nodes ref a structure node.",
      "Drawing shapes, notes, and text carry no meaning and skip structural rules."],
    unrestricted: false,
  }];
  const node = (id: string, kind: string, label: string, props: JsonObject = {}, ref?: JsonObject): JsonObject => ({ id, kind, label, propsJson: JSON.stringify(props), ...(ref ? { ref } : {}) });
  const edge = (id: string, from: string, to: string, kind: string, props: JsonObject = {}): JsonObject => ({ id, from, to, kind, propsJson: JSON.stringify(props) });
  type Box = [x: number, y: number, width: number, height: number];
  const samples: { name: string; agentVisible: boolean; nodes: [JsonObject, Box][]; edges: JsonObject[] }[] = [
    { name: "Demo platform", agentVisible: true, nodes: [
      [node("area", "frame", "Backend", { style: { fill: "none", dashed: true, textAlign: "left", bold: true } }), [300, 0, 580, 420]],
      [node("web", "frontend", "Storefront", { technology: "React" }), [40, 140, 200, 88]],
      [node("api", "api", "Orders API", { technology: "Go" }), [340, 60, 200, 88]],
      [node("db", "database", "Orders", { technology: "Postgres" }), [640, 40, 180, 120]],
      [node("cache", "cache", "Sessions", { technology: "Redis" }), [640, 220, 180, 120]],
      [node("jobs", "queue", "Jobs", { technology: "RabbitMQ" }), [340, 240, 200, 88]],
      [node("core", "component", "Core", {}, { kind: "node", id: "comp-core" }), [40, 320, 200, 100]],
    ], edges: [
      edge("calls", "web", "api", "calls", { label: "REST" }), edge("writes", "api", "db", "writes"),
      edge("reads", "api", "cache", "reads"), edge("publishes", "api", "jobs", "publishes"),
    ] },
    { name: "Demo sketch", agentVisible: false, nodes: [
      [node("start", "terminator", "Request"), [40, 60, 180, 72]],
      [node("check", "diamond", "Cached?"), [300, 36, 160, 120]],
      [node("idea", "cloud", "Try edge caching"), [540, 40, 200, 110]],
    ], edges: [edge("next", "start", "check", "flows"), edge("maybe", "check", "idea", "relates")] },
  ];
  let canvases: JsonObject[] = samples.map((sample, index) => {
    const nodes: [JsonObject, Box][] = [...sample.nodes, [node("welcome", "note", "Demonstration only — edits last for this browser session.", { color: "yellow" }), [40, 480, 280, 120]]];
    return {
      id: `preview-canvas-${index}`, projectId: "browser-preview", name: sample.name, type: "canvas",
      agentVisible: sample.agentVisible, graph: { nodes: nodes.map(([item]) => item), edges: sample.edges },
      layoutJson: JSON.stringify({ version: 1, nodes: Object.fromEntries(nodes.map(([item, [x, y, width, height]]) => [String(item.id), { x, y, width, height }])) }),
      scopeNodeId: "", createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z",
    };
  });
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
      if (!node.kind || !type.nodeKinds.includes(String(node.kind))) throw new Error(`nodes[${index}]: kind is not allowed`);
      const ref = node.ref as JsonObject | undefined;
      if (ref && (!["card", "decision", "fact", "evidence", "node"].includes(String(ref.kind)) || !ref.id)) throw new Error(`nodes[${index}]: invalid reference`);
      if (structure.includes(String(node.kind)) && (ref?.kind !== "node" || !ref.id)) throw new Error(`nodes[${index}]: requires a ref to a structure node`);
    });
    graph.edges.forEach((edge, index) => {
      if (!edge.id || edgeIds.has(String(edge.id))) throw new Error(`edges[${index}]: unique id is required`);
      edgeIds.add(String(edge.id));
      if (!ids.has(String(edge.from)) || !ids.has(String(edge.to))) throw new Error(`edges[${index}]: endpoints must match nodes`);
      if (!edge.kind || !type.edgeKinds.includes(String(edge.kind))) throw new Error(`edges[${index}]: kind is not allowed`);
    });
  }
  return {
    listCanvasTypes: async () => ({ types: clone(types) }),
    listCanvases: async (args = {}) => ({ canvases: clone(canvases.filter((item) => item.projectId === args.projectId && Boolean(item.archivedAt) === (args.archived === true))) }),
    getCanvas: async (args = {}) => ({ canvas: clone(find(args)) }),
    createCanvas: async (args = {}) => {
      const now = new Date().toISOString();
      const canvas: JsonObject = { id: crypto.randomUUID(), projectId: String(args.projectId ?? ""), name: String(args.name ?? "").trim(), type: args.type ?? "",
        agentVisible: args.agentVisible === true, graph: args.graph ?? { nodes: [], edges: [] }, layoutJson: args.layoutJson ?? "{}", scopeNodeId: "", createdAt: now, updatedAt: now };
      validate(canvas); canvases.push(clone(canvas)); return { canvas: clone(canvas) };
    },
    updateCanvas: async (args = {}) => {
      const canvas = clone(find(args));
      if (canvas.archivedAt) throw new Error("restore the canvas before editing it");
      for (const key of ["name", "agentVisible", "graph", "layoutJson"] as const) if (args[key] !== undefined) canvas[key] = clone(args[key]);
      canvas.updatedAt = new Date().toISOString(); validate(canvas);
      canvases = canvases.map((item) => item.id === canvas.id ? canvas : item); return { canvas: clone(canvas) };
    },
    setCanvasArchived: async (args = {}) => {
      const canvas = clone(find(args));
      canvas.archivedAt = args.archived === true ? new Date().toISOString() : "";
      canvases = canvases.map((item) => item.id === canvas.id ? canvas : item); return { canvas: clone(canvas) };
    },
    deleteCanvas: async (args = {}) => {
      const canvas = find(args);
      if (!canvas.archivedAt) throw new Error("archive the canvas before deleting it permanently");
      canvases = canvases.filter((item) => item.id !== canvas.id); return {};
    },
  };
}
