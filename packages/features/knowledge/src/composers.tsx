import { createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import {
  Boxes,
  Button,
  Composer,
  Folder,
  Layers,
  Scale,
  StatusDot,
  type ComposerDraft,
  type ComposerProperty,
  type PropertyOption,
} from "@polterware/frontend-design-system";
import type { DecisionLevel, DocType, ScopeNodeItem, WorkStage, WorkspaceMilestone } from "@polterware/feature-shell";
import { DOC_TYPES, docTypeIcon } from "./doc-type";
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

export type DecisionDraft = { title: string; context: string; level: DecisionLevel; scopePath: string; why: string };

export type DocDraft = { title: string; body: string; docType: DocType; path: string; scopePath: string; why: string };

/** Resolves false when the write failed, so the composer keeps the draft. */
type Create<T> = (draft: T) => Promise<boolean>;

const WHY = "Optional. Recorded in Activity";

function scopeOptions(nodes: readonly ScopeNodeItem[]): PropertyOption[] {
  return [
    { value: "", label: "Whole project" },
    ...[...nodes].sort((a, b) => a.path.localeCompare(b.path)).map((node) => ({ value: node.path, label: node.path })),
  ];
}

function scopeProperty(nodes: readonly ScopeNodeItem[], value: () => string, onChange: (path: string) => void): ComposerProperty {
  return { id: "scope", label: "Scope", icon: <Layers size={14} />, options: scopeOptions(nodes), value: value(), onChange };
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
      options: [{ value: "", label: "Backlog" }, ...milestones().map((item) => ({ value: item.id, label: item.name }))],
      value: milestoneId(),
      onChange: setMilestoneId,
    },
    ...(props.components.length > 0
      ? [{
          id: "under",
          label: "Component",
          icon: <Boxes size={14} />,
          options: [{ value: "", label: "No component" }, ...props.components.map((item) => ({ value: item.path, label: item.path }))],
          value: under(),
          onChange: setUnder,
        }]
      : []),
    {
      id: "kind",
      label: "Kind",
      options: [{ value: "feature", label: "Feature" }, { value: "architecture", label: "Architecture change" }],
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
  defaultScopePath: string;
  onClose: () => void;
  onCreate: Create<DecisionDraft>;
}) {
  const [level, setLevel] = createSignal<DecisionLevel>("decision");
  const [scopePath, setScopePath] = createSignal("");
  createEffect(on(() => props.open, (open) => {
    if (!open) return;
    setLevel("decision");
    setScopePath(props.defaultScopePath);
  }));
  const properties = (): ComposerProperty[] => [
    {
      id: "level",
      label: "Level",
      icon: <Scale size={14} />,
      options: [{ value: "decision", label: "Decision" }, { value: "principle", label: "Principle (whole project)" }],
      value: level(),
      onChange: (value) => setLevel(value === "principle" ? "principle" : "decision"),
    },
    // A principle applies to the whole project, so it takes no scope.
    ...(level() === "decision" && props.scopeNodes.length > 0 ? [scopeProperty(props.scopeNodes, scopePath, setScopePath)] : []),
  ];
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
        props.onCreate({
          title: draft.title,
          context: draft.description,
          level: level(),
          scopePath: level() === "decision" ? scopePath() : "",
          why: draft.why,
        })}
    />
  );
}

function DocComposer(props: {
  open: boolean;
  crumb: string;
  scopeNodes: readonly ScopeNodeItem[];
  defaultScopePath: string;
  onClose: () => void;
  onCreate?: Create<DocDraft>;
  onImportProjectSources?: () => void;
  importBusy?: boolean;
}) {
  const [docType, setDocType] = createSignal<DocType>("doc");
  const [scopePath, setScopePath] = createSignal("");
  const [path, setPath] = createSignal("");
  createEffect(on(() => props.open, (open) => {
    if (!open) return;
    setDocType("doc");
    setScopePath(props.defaultScopePath);
    setPath("");
  }));
  const properties = (): ComposerProperty[] => [
    {
      id: "type",
      label: "Type",
      options: DOC_TYPES.map((item) => ({ value: item.id, label: item.label, icon: docTypeIcon(item.id, 14) })),
      value: docType(),
      onChange: (value) => setDocType(DOC_TYPES.some((item) => item.id === value) ? (value as DocType) : "doc"),
    },
    ...(props.scopeNodes.length > 0 ? [scopeProperty(props.scopeNodes, scopePath, setScopePath)] : []),
  ];
  const importAction = (): JSX.Element | undefined =>
    props.onImportProjectSources ? (
      <Button size="sm" variant="ghost" disabled={props.importBusy} onClick={() => props.onImportProjectSources?.()}>
        Import from project root
      </Button>
    ) : undefined;
  return (
    <Composer
      open={props.open}
      onClose={props.onClose}
      crumbs={[props.crumb, "New doc"]}
      titlePlaceholder="Doc title"
      descriptionPlaceholder="Write in Markdown…"
      properties={properties()}
      whyPlaceholder={WHY}
      footerAction={importAction()}
      submitLabel="Create doc"
      fields={[{ id: "path", label: "Path", placeholder: "Optional file, such as README.md or infra/main.tf", value: path(), onChange: setPath }]}
      onSubmit={(draft) => {
        if (!props.onCreate) return false;
        return props.onCreate({ title: draft.title, body: draft.description, docType: docType(), path: path().trim(), scopePath: scopePath(), why: draft.why })
          .then((written) => {
            if (written) setPath("");
            return written;
          });
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
  /** Path of the active global scope; new decisions and docs start in it. */
  defaultScopePath?: string;
  onCreateCard: Create<CardDraft>;
  onCreateDecision: Create<DecisionDraft>;
  onCreateDoc?: Create<DocDraft>;
  onImportProjectSources?: () => void;
  importBusy?: boolean;
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
        defaultScopePath={props.defaultScopePath ?? ""}
        onClose={props.onClose}
        onCreate={props.onCreateDecision}
      />
      <DocComposer
        open={kind() === "doc"}
        crumb={props.crumb}
        scopeNodes={props.scopeNodes}
        defaultScopePath={props.defaultScopePath ?? ""}
        onClose={props.onClose}
        onCreate={props.onCreateDoc}
        onImportProjectSources={props.onImportProjectSources}
        importBusy={props.importBusy}
      />
    </>
  );
}
