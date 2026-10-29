import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { updateNode, type ArchNode, type ArchitectureDocument, type Relationship } from "@polterware/frontend-canvas";
import {
  Button, CollapsibleSection, Field, FormStack, Input, LayoutDashboard, NumberStepper,
  SegmentedControl, Select, Server, TabPanel, Tabs, Textarea, X,
} from "@polterware/frontend-design-system";
import { component, COMPONENTS, FAMILIES, family, structureKind } from "./components";
import { NodeInspector } from "./inspector";
import { linkedFacts, readRef, referenceState, setReference, type StoreEntity } from "./references";
import { kindLabel, shape } from "./shapes";
import { colorTags, fillToken, readStyle, strokeToken, withStyle, type ShapeStyle } from "./style";
import { TypeInspector } from "./type-inspector";
import { properties, propertyText, withProperties, type CanvasBehavior } from "./types/shared";
import type { CanvasType } from "./model";
import type { PromotionInput } from "./promotion";

type Change = (next: ArchitectureDocument, mode?: "immediately" | "eventually") => void;
type Tab = "style" | "text" | "arrange" | "data";

export function CanvasInspector(props: {
  doc: ArchitectureDocument; nodes: readonly ArchNode[]; edge?: Relationship;
  definition: CanvasType; behavior: CanvasBehavior & { palette: () => string[]; edges: () => string[] };
  canvasName: string;
  entities: readonly StoreEntity[]; change: Change;
  promote?: (input: PromotionInput) => Promise<StoreEntity>;
}) {
  // Panels are keyed by id, not by object, so edits keep the open tab and the focused input.
  return <aside class="pw-canvas-panel-root" aria-label="Inspector">
    <Show when={props.nodes.length === 1 ? props.nodes[0]!.id : undefined} keyed fallback={
      <Show when={props.edge?.id} keyed fallback={<Show when={props.nodes.length > 1}><MultiPanel nodes={props.nodes} doc={props.doc} change={props.change} /></Show>}>
        {(id) => <Show when={props.doc.relationships.find((edge) => edge.id === id)}>{(edge) => <EdgePanel {...props} edge={edge()} />}</Show>}
      </Show>}>
      {(id) => <Show when={props.doc.nodes.some((node) => node.id === id)}><NodePanel {...props} id={id} /></Show>}
    </Show>
  </aside>;
}

function Heading(props: { title: string; detail?: string }) {
  return <header class="pw-canvas-panel-head">
    <h2 class="pw-canvas-panel-title">{props.title}</h2>
    <Show when={props.detail}><p class="pw-canvas-panel-detail">{props.detail}</p></Show>
  </header>;
}
function Body(props: { children: JSX.Element }) {
  return <div class="pw-canvas-panel-body pw-scroll-fade">{props.children}</div>;
}
function Swatches(props: { label: string; value: string; token: (tag: string) => string; onChange: (tag: string) => void; none?: boolean }) {
  return <Field label={props.label}><div class="flex flex-wrap gap-1" role="radiogroup" aria-label={props.label}>
    <For each={props.none === false ? colorTags : [...colorTags, "none"]}>{(tag) => <Button size="icon" variant="ghost" role="radio" aria-checked={props.value === tag} selected={props.value === tag}
      aria-label={`${props.label}: ${tag}`} onClick={() => props.onChange(tag)}>
      <Show when={tag !== "none"} fallback={<X size={14} />}><span class="pw-canvas-swatch" style={{ background: props.token(tag) }} /></Show>
    </Button>}</For>
  </div></Field>;
}
function Segments(props: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <Field label={props.label}><SegmentedControl aria-label={props.label} value={props.value} options={props.options} onValueChange={(details) => { if (details.value) props.onChange(details.value); }} /></Field>;
}

function NodePanel(props: Parameters<typeof CanvasInspector>[0] & { id: string }) {
  // Keep the last known node while a deletion unmounts this panel.
  let last = props.doc.nodes.find((item) => item.id === props.id)!;
  const node = createMemo(() => (last = props.doc.nodes.find((item) => item.id === props.id) ?? last));
  const library = () => !!shape(node().type) || !!component(node().type);
  // The semantic card keeps its label next to the icon tile, so alignment does not apply.
  const semantic = () => !!component(node().type) || structureKind(node().type);
  const ref = () => readRef(node());
  // A note has a color, a title (its label) and a body.
  const note = () => node().type === "note";
  const noteColor = () => propertyText(node(), "color") || "yellow";
  const setProp = (key: string, value: string, mode: "immediately" | "eventually") =>
    props.change(updateNode(props.doc, props.id, withProperties(node(), { ...properties(node()), [key]: value })), mode);
  const [tab, setTab] = createSignal<Tab>(library() ? "style" : "text");
  const tabs = () => [...(library() ? [{ id: "style", label: "Style" }] : []), { id: "text", label: "Text" }, { id: "arrange", label: "Arrange" }, { id: "data", label: "Data" }];
  const style = () => readStyle(node());
  const setStyle = (patch: Partial<ShapeStyle>) => props.change({ ...props.doc, nodes: props.doc.nodes.map((item) => item.id === props.id ? withStyle(item, patch) : item) });
  const title = () => ref() ? referenceState(ref(), props.entities).title : node().name || kindLabel(node().type);
  const linked = () => linkedFacts(node(), props.entities);
  const geometry = (key: "x" | "y" | "width" | "height", value: number) => {
    if (!Number.isFinite(value)) return;
    const min = key === "width" ? 40 : key === "height" ? 32 : -Infinity;
    props.change(updateNode(props.doc, props.id, { [key]: Math.max(min, Math.round(value)) }), "eventually");
  };
  // The types a family offers on this canvas; a new family starts at its default type and size, so the silhouette fits.
  const allowed = (id: string) => COMPONENTS.filter((item) => item.family === id && props.behavior.palette().includes(item.kind));
  const switchFamily = (id: string) => {
    const next = FAMILIES.find((item) => item.id === id);
    const kinds = allowed(id).map((item) => item.kind);
    if (!next || !kinds.length || id === family(node().type)?.id) return;
    props.change(updateNode(props.doc, props.id, { type: kinds.includes(next.kind) ? next.kind : kinds[0]!, ...next.geometry }));
  };
  // Graph order is the persisted stacking order; zIndex follows it.
  const order = (front: boolean) => {
    const rest = props.doc.nodes.filter((item) => item.id !== props.id);
    const nodes = front ? [...rest, node()] : [node(), ...rest];
    props.change({ ...props.doc, nodes: nodes.map((item, zIndex) => ({ ...item, zIndex })) });
  };
  return <>
    <Heading title={title()} detail={[kindLabel(linked()?.kind ?? node().type), linked()?.tech ?? propertyText(node(), "technology")].filter(Boolean).join(" · ")} />
    <div class="pw-canvas-panel-tabs"><Tabs aria-label="Shape inspector" items={tabs()} value={tabs().some((item) => item.id === tab()) ? tab() : "text"} onChange={(id) => setTab(id as Tab)} /></div>
    <Body>
      <TabPanel id="canvas-style" active={tab() === "style" && library()}><FormStack class="w-full pt-3">
        <Show when={family(node().type)}>{(current) => <>
          <Field label="Family"><Select aria-label="Component family" value={current().id} onChange={(id) => switchFamily(id)}
            options={FAMILIES.filter((item) => allowed(item.id).length).map((item) => ({ value: item.id, label: item.label }))} /></Field>
          <Field label="Type"><Select aria-label="Component type" value={node().type} onChange={(type) => props.change(updateNode(props.doc, props.id, { type }))}
            options={allowed(current().id).map((item) => ({ value: item.kind, label: item.label }))} /></Field>
        </>}</Show>
        <Swatches label="Fill" value={style().fill} token={fillToken} onChange={(fill) => setStyle({ fill })} />
        <Swatches label="Line" value={style().stroke} token={strokeToken} onChange={(stroke) => setStyle({ stroke })} />
        <Segments label="Line width" value={String(style().strokeWidth)} options={[{ value: "1", label: "1 px" }, { value: "2", label: "2 px" }, { value: "3", label: "3 px" }]} onChange={(value) => setStyle({ strokeWidth: Number(value) as 1 | 2 | 3 })} />
        <Segments label="Line pattern" value={style().dashed ? "dashed" : "solid"} options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }]} onChange={(value) => setStyle({ dashed: value === "dashed" })} />
      </FormStack></TabPanel>
      <TabPanel id="canvas-text" active={tab() === "text" || (tab() === "style" && !library())}><FormStack class="w-full pt-3">
        <Show when={note()}><Swatches label="Note color" value={noteColor()} token={fillToken} none={false} onChange={(color) => setProp("color", color, "immediately")} /></Show>
        <Show when={!ref()} fallback={<p class="pw-canvas-panel-note">The label follows the referenced {kindLabel(ref()!.kind)}.</p>}>
          <Field label={note() ? "Title" : "Label"}><Input aria-label={note() ? "Title" : "Label"} value={node().name} onInput={(event) => props.change(updateNode(props.doc, props.id, { name: event.currentTarget.value }), "eventually")} /></Field>
        </Show>
        <Show when={note()}><Field label="Body"><Textarea aria-label="Body" rows={5} value={propertyText(node(), "body")} onInput={(event) => setProp("body", event.currentTarget.value, "eventually")} /></Field></Show>
        {/* A note's title and body have their own type scale. */}
        <Show when={!note()}>
          <Segments label="Text size" value={style().textSize} options={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }]} onChange={(value) => setStyle({ textSize: value as ShapeStyle["textSize"] })} />
          <Show when={!semantic()}><Segments label="Alignment" value={style().textAlign} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} onChange={(value) => setStyle({ textAlign: value as ShapeStyle["textAlign"] })} /></Show>
          <Segments label="Weight" value={style().bold ? "bold" : "regular"} options={[{ value: "regular", label: "Regular" }, { value: "bold", label: "Bold" }]} onChange={(value) => setStyle({ bold: value === "bold" })} />
        </Show>
      </FormStack></TabPanel>
      <TabPanel id="canvas-arrange" active={tab() === "arrange"}><FormStack class="w-full pt-3">
        <div class="grid grid-cols-2 gap-2">
          <NumberStepper label="X" value={String(Math.round(node().x))} onValueChange={(details) => geometry("x", details.valueAsNumber)} />
          <NumberStepper label="Y" value={String(Math.round(node().y))} onValueChange={(details) => geometry("y", details.valueAsNumber)} />
          <NumberStepper label="Width" min={40} value={String(Math.round(node().width))} onValueChange={(details) => geometry("width", details.valueAsNumber)} />
          <NumberStepper label="Height" min={32} value={String(Math.round(node().height))} onValueChange={(details) => geometry("height", details.valueAsNumber)} />
        </div>
        <Field label="Order"><div class="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => order(true)}>Bring to front</Button>
          <Button size="sm" variant="secondary" onClick={() => order(false)}>Send to back</Button>
        </div></Field>
        <Button size="sm" variant="ghost" onClick={() => props.change(updateNode(props.doc, props.id, { x: Math.round(node().x / 24) * 24, y: Math.round(node().y / 24) * 24 }))}>Snap to grid</Button>
      </FormStack></TabPanel>
      <TabPanel id="canvas-data" active={tab() === "data"}><div class="flex w-full flex-col pt-3">
        <NodeInspector node={node()} entities={props.entities} canvasName={props.canvasName}
          structureRequired={!!props.behavior.structureReferences && structureKind(node().type)}
          onLink={(next) => props.change(setReference(props.doc, props.id, next))} promote={props.promote}>
          <Show when={component(node().type)}><ComponentFields node={node()} linkedTech={linked()?.tech}
            change={(next, mode) => props.change(updateNode(props.doc, props.id, next), mode)} /></Show>
          <TypeInspector node={node()} fields={props.behavior.fields(node().type)}
            onApply={(values) => props.change(updateNode(props.doc, props.id, withProperties(node(), values)))} />
        </NodeInspector>
      </div></TabPanel>
    </Body>
  </>;
}

/** What the component is and what it runs on; technology is free text with per-kind suggestions. */
function ComponentFields(props: { node: ArchNode; linkedTech?: string; change: (next: Partial<ArchNode>, mode?: "immediately" | "eventually") => void }) {
  const setProp = (key: string, value: string, mode?: "immediately" | "eventually") => {
    const { [key]: _previous, ...rest } = properties(props.node);
    props.change(withProperties(props.node, value.trim() ? { ...rest, [key]: value } : rest), mode);
  };
  const suggestions = () => (component(props.node.type)?.technologies ?? []).filter((item) => item !== propertyText(props.node, "technology"));
  return <CollapsibleSection title="Component" icon={<Server size={14} />}>
    <FormStack>
      <Show when={props.linkedTech} fallback={<Field label="Technology"><Input aria-label="Technology" placeholder="e.g. Postgres, React, Go" value={propertyText(props.node, "technology")}
        onInput={(event) => setProp("technology", event.currentTarget.value, "eventually")} /></Field>}>
        {(tech) => <Field label="Technology" hint="Set on the linked Structure node."><Input aria-label="Technology" value={tech()} disabled /></Field>}
      </Show>
      <Show when={!props.linkedTech && suggestions().length}><div class="flex flex-wrap gap-1" role="list" aria-label="Technology suggestions">
        <For each={suggestions()}>{(item) => <div role="listitem"><Button size="sm" variant="ghost" aria-label={`Use ${item}`} onClick={() => setProp("technology", item)}>{item}</Button></div>}</For>
      </div></Show>
      <Field label="Description"><Textarea aria-label="Description" rows={3} value={propertyText(props.node, "description")}
        onInput={(event) => setProp("description", event.currentTarget.value, "eventually")} /></Field>
    </FormStack>
  </CollapsibleSection>;
}

function EdgePanel(props: Parameters<typeof CanvasInspector>[0] & { edge: Relationship }) {
  const source = () => props.doc.nodes.find((node) => node.id === props.edge.sourceNodeId);
  const target = () => props.doc.nodes.find((node) => node.id === props.edge.targetNodeId);
  const update = (next: Relationship, mode?: "immediately" | "eventually") =>
    props.change({ ...props.doc, relationships: props.doc.relationships.map((item) => item.id === props.edge.id ? next : item) }, mode);
  return <>
    <Heading title={`Edge: ${kindLabel(props.edge.type)}`} detail={`${source()?.name || "?"} → ${target()?.name || "?"}`} />
    <Body><FormStack class="w-full pt-2">
      <Field label="Edge kind"><Select aria-label="Edge kind" value={props.edge.type} options={props.behavior.edges().map((value) => ({ value, label: kindLabel(value) }))} onChange={(type) => update({ ...props.edge, type })} /></Field>
      <For each={props.behavior.edgeFields(source()?.type ?? "")}>{(field) => <Field label={field.label}>
        <Input aria-label={`Edge ${field.label.toLowerCase()}`} value={propertyText(props.edge, field.key)} onInput={(event) => update(withProperties(props.edge, { ...properties(props.edge), [field.key]: event.currentTarget.value }), "eventually")} />
      </Field>}</For>
    </FormStack></Body>
  </>;
}

const alignments: readonly { id: string; label: string; apply: (node: ArchNode, box: { x: number; y: number; right: number; bottom: number }) => Partial<ArchNode> }[] = [
  { id: "left", label: "Left", apply: (_, box) => ({ x: box.x }) },
  { id: "center", label: "Center", apply: (node, box) => ({ x: (box.x + box.right) / 2 - node.width / 2 }) },
  { id: "right", label: "Right", apply: (node, box) => ({ x: box.right - node.width }) },
  { id: "top", label: "Top", apply: (_, box) => ({ y: box.y }) },
  { id: "middle", label: "Middle", apply: (node, box) => ({ y: (box.y + box.bottom) / 2 - node.height / 2 }) },
  { id: "bottom", label: "Bottom", apply: (node, box) => ({ y: box.bottom - node.height }) },
];
function MultiPanel(props: { nodes: readonly ArchNode[]; doc: ArchitectureDocument; change: Change }) {
  const align = (apply: (typeof alignments)[number]["apply"]) => {
    const box = { x: Math.min(...props.nodes.map((n) => n.x)), y: Math.min(...props.nodes.map((n) => n.y)),
      right: Math.max(...props.nodes.map((n) => n.x + n.width)), bottom: Math.max(...props.nodes.map((n) => n.y + n.height)) };
    const ids = new Set(props.nodes.map((node) => node.id));
    props.change({ ...props.doc, nodes: props.doc.nodes.map((node) => ids.has(node.id) ? { ...node, ...apply(node, box) } : node) });
  };
  return <>
    <Heading title={`${props.nodes.length} shapes selected`} />
    <Body><CollapsibleSection title="Align" icon={<LayoutDashboard size={14} />}>
      <div class="grid grid-cols-3 gap-1"><For each={alignments}>{(item) => <Button size="sm" variant="secondary" aria-label={`Align ${item.id}`} onClick={() => align(item.apply)}>{item.label}</Button>}</For></div>
    </CollapsibleSection></Body>
  </>;
}
