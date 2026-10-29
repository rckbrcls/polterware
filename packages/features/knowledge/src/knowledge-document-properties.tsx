import { children, Show, type JSX } from "solid-js";
import { DetailPanel } from "@polterware/frontend-design-system";

/** Properties rail for every full Markdown document: plain titled groups, as in a Linear issue. */
export function KnowledgeDocumentProperties(props: {
  properties?: JSX.Element;
  /** Tag picker, shown under "Labels". */
  labels?: JSX.Element;
  links?: JSX.Element;
  metadataActions?: JSX.Element;
  footerActions?: JSX.Element;
}) {
  const properties = children(() => props.properties);
  const labels = children(() => props.labels);
  const links = children(() => props.links);
  const metadataActions = children(() => props.metadataActions);
  const footerActions = children(() => props.footerActions);
  return <>
    <Show when={properties() || metadataActions()}>
      <section class="pw-document__group">
        <h3 class="pw-document__group-title">Properties</h3>
        <DetailPanel.Properties variant="rail">{properties()}</DetailPanel.Properties>
        <Show when={metadataActions()}><div class="pw-document__group-actions">{metadataActions()}</div></Show>
      </section>
    </Show>
    <Show when={labels()}>
      <section class="pw-document__group">
        <h3 class="pw-document__group-title">Labels</h3>
        <div class="pw-document__group-body">{labels()}</div>
      </section>
    </Show>
    <Show when={links()}>
      <section class="pw-document__group">
        <h3 class="pw-document__group-title">Links</h3>
        <div class="pw-document__group-body">{links()}</div>
      </section>
    </Show>
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
