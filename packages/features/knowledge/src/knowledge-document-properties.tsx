import { children, Show, type JSX } from "solid-js";
import { Delete, DetailPanel, Layers, Link } from "@polterware/frontend-design-system";

/** Shared properties card content for every full Markdown document. */
export function KnowledgeDocumentProperties(props: {
  properties?: JSX.Element;
  links?: JSX.Element;
  metadataActions?: JSX.Element;
  footerActions?: JSX.Element;
}) {
  const properties = children(() => props.properties);
  const links = children(() => props.links);
  const metadataActions = children(() => props.metadataActions);
  const footerActions = children(() => props.footerActions);
  return <>
    <Show when={properties() || metadataActions()}>
      <DetailPanel.Section title="Organize" icon={<Layers size={14} />} collapsible>
        <DetailPanel.Properties>{properties()}</DetailPanel.Properties>
        <Show when={metadataActions()}><div class="pw-detail-panel__actions">{metadataActions()}</div></Show>
      </DetailPanel.Section>
    </Show>
    <Show when={links()}>
      <DetailPanel.Section title="Links" icon={<Link size={14} />} collapsible>
        <DetailPanel.Properties><KnowledgeDocumentProperty label="Linked entities">{links()}</KnowledgeDocumentProperty></DetailPanel.Properties>
      </DetailPanel.Section>
    </Show>
    <Show when={footerActions()}>
      <DetailPanel.Section title="Danger zone" icon={<Delete size={14} />} collapsible defaultOpen={false}>
        <div class="pw-detail-panel__actions">{footerActions()}</div>
      </DetailPanel.Section>
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
