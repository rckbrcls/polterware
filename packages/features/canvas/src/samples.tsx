import { createUniqueId } from "solid-js";
import type { ArchNode } from "@polterware/frontend-canvas";
import { component, family } from "./components";
import { CanvasNode } from "./node-renderer";
import { kindLabel, shape } from "./shapes";
import { canvasDefaults } from "./types";
import { withProperties } from "./types/shared";

const PAD = 12;
const LABEL_BELOW = 36;

const familySamples: Record<string, string> = {
  client: "Storefront", compute: "Orders", workflow: "Nightly sync", storage: "Orders DB", messaging: "Order events", ai: "Assistant", edge: "Public edge",
  security: "Sign-in", platform: "Production", observability: "Health", external: "Stripe", people: "Customers", document: "Orders API",
};
const samples: Record<string, string> = { note: "Retry budget", text: "Heading text", domain: "Billing", component: "Checkout" };

/** The node the editor would insert for this kind, at the origin, with sample text so it reads as it will on a canvas. */
function sampleNode(kind: string, title?: string, id = `sample-${kind}`): ArchNode {
  const geometry = { width: 180, height: 100, ...canvasDefaults.initialGeometry?.(kind), ...shape(kind)?.geometry };
  const name = title ?? samples[kind] ?? familySamples[family(kind)?.id ?? ""] ?? kindLabel(kind);
  const node: ArchNode = { id, name, type: kind, origin: "manual", state: "unknown", x: 0, y: 0, ...geometry, zIndex: 0, metadata: { propsJson: "{}" } };
  const props = { ...canvasDefaults.defaults(kind), ...(component(kind)?.technologies[0] ? { technology: component(kind)!.technologies[0] } : {}),
    ...(kind === "note" ? { body: "Cap retries at three per request and alert past one percent." } : {}) };
  return withProperties(node, props);
}

/**
 * A kind drawn by the real renderer, fitted to its box: what the gallery and the shape library show. A title and id
 * draw a real node instead, such as a Structure node the library offers.
 */
export function NodeSample(props: { kind: string; title?: string; id?: string }) {
  const node = sampleNode(props.kind, props.title, props.id);
  const below = shape(props.kind)?.labelBelow ? LABEL_BELOW : 0;
  return <svg class="pw-canvas-gallery-art" viewBox={`${-PAD} ${-PAD} ${node.width + PAD * 2} ${node.height + below + PAD * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <CanvasNode node={node} variant={canvasDefaults.variant(props.kind)} selected={false}>
      <span class="w-full break-words text-center text-sm text-[var(--color-text-primary)]">{node.name}</span>
    </CanvasNode>
  </svg>;
}

/** A connection of this kind, drawn as a straight line with its pattern and arrow. */
export function EdgeSample(props: { kind: string }) {
  const style = canvasDefaults.edgeStyle(props.kind);
  const id = `canvas-sample-arrow-${createUniqueId()}`;
  return <svg class="pw-canvas-gallery-art" viewBox="0 0 200 60" aria-hidden="true">
    <defs><marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
    <g class="pw-canvas-edge"><path d="M24 30H176" fill="none" stroke-width="2" stroke-dasharray={style.dashed ? "6 4" : undefined} marker-end={style.arrow ? `url(#${id})` : undefined} /></g>
  </svg>;
}
