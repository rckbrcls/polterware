import { children, Show, type JSX } from "solid-js";
import { DetailPanel, InformationCircle, RailGroup, Tag } from "@polterware/frontend-design-system";

/** Properties rail for every full Markdown document: groups titled with an icon tile, never cards. */
export function KnowledgeDocumentProperties(props: {
  properties?: JSX.Element;
  /** Tag picker, shown under "Labels". */
  labels?: JSX.Element;
  /** More rail groups after Labels, such as a card's tasks and invariants. */
  groups?: JSX.Element;
  metadataActions?: JSX.Element;
  footerActions?: JSX.Element;
}) {
  const properties = children(() => props.properties);
  const labels = children(() => props.labels);
  const metadataActions = children(() => props.metadataActions);
  const footerActions = children(() => props.footerActions);
  return <>
    <Show when={properties() || metadataActions()}>
      <RailGroup title="Properties" icon={<InformationCircle size={14} />} actions={metadataActions()}>
        <DetailPanel.Properties variant="rail">{properties()}</DetailPanel.Properties>
      </RailGroup>
    </Show>
    <Show when={labels()}>
      <RailGroup title="Labels" icon={<Tag size={14} />}>
        <div class="pw-document__group-body">{labels()}</div>
      </RailGroup>
    </Show>
    {props.groups}
    <Show when={footerActions()}>
      <div class="pw-document__rail-footer">{footerActions()}</div>
    </Show>
  </>;
}

/** Optional rows retain the shared label/value layout and wrapping controls. */
export function KnowledgeDocumentProperty(props: { label: string; children: JSX.Element; mono?: boolean; show?: boolean }) {
  return <Show when={props.show ?? true}>
    <DetailPanel.Property label={props.label} mono={props.mono} value={
      <div class="flex w-full min-w-0 flex-wrap items-center gap-1.5 [overflow-wrap:anywhere] [&>.control-field]:w-full [&>.pw-detail-panel__links]:w-full">{props.children}</div>
    } />
  </Show>;
}
