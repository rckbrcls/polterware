import { ErrorBoundary, Show, createMemo, type ParentProps } from "solid-js";
import { Dynamic } from "solid-js/web";
import { DetailPanel, PageError } from "@polterware/frontend-design-system";
import { useNotesShell } from "./context";

export function NoteDetailHost(props: ParentProps) {
  const shell = useNotesShell();
  const noteProperties = createMemo(() => shell.features.find(feature => feature.noteProperties)?.noteProperties);
  return <DetailPanel.Root expandable={false} open={!!shell.selectedNoteId() && !!noteProperties() && !!shell.propertiesOpen?.()}
    expanded={shell.expanded?.() ?? false} activeEntityId={shell.selectedNoteId()} onOpenChange={open => shell.setPropertiesOpen?.(open)}
    onExpandedChange={expanded => shell.setExpanded?.(expanded)} aria-label="Note details">
    <DetailPanel.Collection>{props.children}</DetailPanel.Collection>
    <DetailPanel.Content><DetailPanel.Header /><ErrorBoundary fallback={(error, reset) => <PageError title="This feature failed" message={error.message} onRetry={reset} />}>
      <Show when={shell.selectedNoteId()}>{id => <Show when={noteProperties()}>{component => <Dynamic component={component()} noteId={id()} detailSections={shell.detailSections()} />}</Show>}</Show>
    </ErrorBoundary></DetailPanel.Content>
  </DetailPanel.Root>;
}
