import { createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import { FolderKanban, Inbox, SchemeIcon, XIcon,
  Boxes,
  Button,
  Composer,
  Folder,
  Layers,
  StatusDot,
  type ComposerDraft,
  type ComposerProperty,
} from "@polterware/frontend-design-system";
import { scopeContextOptions, type ScopeNodeItem, type WorkStage, type WorkspaceMilestone } from "@polterware/feature-shell";
import { listedMilestones } from "./milestones";
import { WORK_STAGES, workStageTone } from "./work-stage";

/** What C or a "+" asks to create, with the properties the surface already knows. */
export type ComposeRequest =
  | { kind: "card"; stage?: WorkStage; milestoneId?: string }
  | { kind: "decision" }
  | { kind: "doc" };

export type CardKind = "feature" | "architecture";

export type CardDraft = {
  title: string;
  /** The description; Polter keeps it as the card's intent. */
  intent: string;
  stage: WorkStage;
  /** Slug of the milestone; empty keeps the card in the Backlog. */
  milestone: string;
  /** Path of the component the card lives under; empty is not placed yet. */
  under: string;
  kind: CardKind;
  why: string;
};

/** `scopeNodeIds` are the contexts; none makes the decision a principle. */
export type DecisionDraft = { title: string; context: string; scopeNodeIds: string[]; why: string };

export type DocDraft = { title: string; body: string; scopeNodeIds: string[]; why: string };

/** Resolves false when the write failed, so the composer keeps the draft. */
type Create<T> = (draft: T) => Promise<boolean>;

const WHY = "Optional. Recorded in Activity";

/** The Context property: Structure nodes as tokens, like the scope filter menu's. */
/** The Context property: the Structure nodes an entity is about, as chips. */
export function contextProperty(nodes: readonly ScopeNodeItem[], values: () => string[], onChange: (ids: string[]) => void): ComposerProperty {
  return {
    id: "contexts",
    label: "Context",
    icon: <Layers size={14} />,
    emptyLabel: "Whole project",
    options: scopeContextOptions(nodes),
    values: values(),
    onValuesChange: onChange,
  };
}

function CardComposer(props: {
  open: boolean;
  request: Extract<ComposeRequest, { kind: "card" }>;
  crumb: string;
  milestones: readonly WorkspaceMilestone[];
  components: readonly { path: string; title: string }[];
  onClose: () => void;
  onCreate: Create<CardDraft>;
}) {
  const [stage, setStage] = createSignal<WorkStage>("shape");
  const [milestoneId, setMilestoneId] = createSignal("");
  const [under, setUnder] = createSignal("");
  const [kind, setKind] = createSignal<CardKind>("feature");
  createEffect(on(() => [props.open, props.request] as const, ([open]) => {
    if (!open) return;
    setStage(props.request.stage ?? "shape");
    setMilestoneId(props.request.milestoneId ?? "");
    setUnder("");
    setKind("feature");
  }));
  const milestones = createMemo(() => listedMilestones(props.milestones));
  const properties = (): ComposerProperty[] => [
    {
      id: "stage",
      label: "Stage",
      options: WORK_STAGES.map((item) => ({ value: item.id, label: item.label, icon: <StatusDot tone={workStageTone(item.id)} showLabel={false} /> })),
      value: stage(),
      onChange: (value) => setStage(value as WorkStage),
    },
    {
      id: "milestone",
      label: "Milestone",
      icon: <Folder size={14} />,
      options: [{ value: "", label: "Backlog", icon: <Inbox size={12} /> }, ...milestones().map((item) => ({ value: item.id, label: item.name, icon: <Folder size={12} /> }))],
      value: milestoneId(),
      onChange: setMilestoneId,
    },
    ...(props.components.length > 0
      ? [{
          id: "under",
          label: "Component",
          icon: <Boxes size={14} />,
          options: [{ value: "", label: "No component", icon: <XIcon size={12} /> }, ...props.components.map((item) => ({ value: item.path, label: item.path, icon: <Boxes size={12} /> }))],
          value: under(),
          onChange: setUnder,
        }]
      : []),
    {
      id: "kind",
      label: "Kind",
      options: [{ value: "feature", label: "Feature", icon: <FolderKanban size={12} /> }, { value: "architecture", label: "Architecture change", icon: <SchemeIcon size={12} /> }],
      value: kind(),
      onChange: (value) => setKind(value === "architecture" ? "architecture" : "feature"),
    },
  ];
  return (
    <Composer
      open={props.open}
      onClose={props.onClose}
      crumbs={[props.crumb, "New card"]}
      titlePlaceholder="Card title"
      descriptionPlaceholder="What we want and why…"
      properties={properties()}
      whyPlaceholder={WHY}
      submitLabel="Create card"
      onSubmit={(draft: ComposerDraft) =>
        props.onCreate({
          title: draft.title,
          intent: draft.description,
          stage: stage(),
          milestone: milestones().find((item) => item.id === milestoneId())?.slug ?? "",
          under: under(),
          kind: kind(),
          why: draft.why,
        })}
    />
  );
}

function DecisionComposer(props: {
  open: boolean;
  crumb: string;
  scopeNodes: readonly ScopeNodeItem[];
  defaultScopeNodeIds: readonly string[];
  onClose: () => void;
  onCreate: Create<DecisionDraft>;
}) {
  const [contexts, setContexts] = createSignal<string[]>([]);
  createEffect(on(() => props.open, (open) => {
    if (open) setContexts([...props.defaultScopeNodeIds]);
  }));
  // No context makes the decision a principle: it applies to the whole project.
  const properties = (): ComposerProperty[] =>
    props.scopeNodes.length > 0 ? [contextProperty(props.scopeNodes, contexts, setContexts)] : [];
  return (
    <Composer
      open={props.open}
      onClose={props.onClose}
      crumbs={[props.crumb, "New decision"]}
      titlePlaceholder="Decision title"
      descriptionPlaceholder="Context: what forces this decision…"
      properties={properties()}
      whyPlaceholder={WHY}
      submitLabel="Create decision"
      onSubmit={(draft) =>
        props.onCreate({ title: draft.title, context: draft.description, scopeNodeIds: contexts(), why: draft.why })}
    />
  );
}

function DocComposer(props: {
  open: boolean;
  crumb: string;
  scopeNodes: readonly ScopeNodeItem[];
  defaultScopeNodeIds: readonly string[];
  onClose: () => void;
  onCreate?: Create<DocDraft>;
}) {
  const [contexts, setContexts] = createSignal<string[]>([]);
  createEffect(on(() => props.open, (open) => {
    if (open) setContexts([...props.defaultScopeNodeIds]);
  }));
  const properties = (): ComposerProperty[] =>
    props.scopeNodes.length > 0 ? [contextProperty(props.scopeNodes, contexts, setContexts)] : [];
  return (
    <Composer
      open={props.open}
      onClose={props.onClose}
      crumbs={[props.crumb, "New doc"]}
      titlePlaceholder="Doc title"
      descriptionPlaceholder="Write in Markdown…"
      properties={properties()}
      whyPlaceholder={WHY}
      submitLabel="Create doc"
      onSubmit={(draft) => {
        if (!props.onCreate) return false;
        return props.onCreate({ title: draft.title, body: draft.description, scopeNodeIds: contexts(), why: draft.why });
      }}
    />
  );
}
/**
 * The one composer a surface opens with C or "+": a card, a decision, or a doc, with the
 * properties the request already knows. The host owns every write.
 */
export function KnowledgeComposer(props: {
  request: ComposeRequest | null;
  onClose: () => void;
  /** First crumb, such as the project name. */
  crumb: string;
  milestones: readonly WorkspaceMilestone[];
  components: readonly { path: string; title: string }[];
  scopeNodes: readonly ScopeNodeItem[];
  /** Node ids of the active global scope; new decisions and docs start with them as contexts. */
  defaultScopeNodeIds?: readonly string[];
  onCreateCard: Create<CardDraft>;
  onCreateDecision: Create<DecisionDraft>;
  onCreateDoc?: Create<DocDraft>;
}) {
  const kind = () => props.request?.kind;
  // The last card request stays while the composer closes, so its properties do not jump.
  const [cardRequest, setCardRequest] = createSignal<Extract<ComposeRequest, { kind: "card" }>>({ kind: "card" });
  createEffect(() => {
    const request = props.request;
    if (request?.kind === "card") setCardRequest(request);
  });
  return (
    <>
      <CardComposer
        open={kind() === "card"}
        request={cardRequest()}
        crumb={props.crumb}
        milestones={props.milestones}
        components={props.components}
        onClose={props.onClose}
        onCreate={props.onCreateCard}
      />
      <DecisionComposer
        open={kind() === "decision"}
        crumb={props.crumb}
        scopeNodes={props.scopeNodes}
        defaultScopeNodeIds={props.defaultScopeNodeIds ?? []}
        onClose={props.onClose}
        onCreate={props.onCreateDecision}
      />
      <DocComposer
        open={kind() === "doc"}
        crumb={props.crumb}
        scopeNodes={props.scopeNodes}
        defaultScopeNodeIds={props.defaultScopeNodeIds ?? []}
        onClose={props.onClose}
        onCreate={props.onCreateDoc}
      />
    </>
  );
}
