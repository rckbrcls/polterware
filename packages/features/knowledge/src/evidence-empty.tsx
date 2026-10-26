import { Button, PageEmpty } from "@polterware/frontend-design-system";
import { Show } from "solid-js";
import type { KnowledgeCreateTemplate } from "./create-templates";
import { KnowledgeTemplateGrid } from "./knowledge-template-grid";

export function EvidenceEmpty(props: {
  onCreate?: () => void;
  onImport?: () => void;
  importBusy?: boolean;
  onCreateFromTemplate?: (template: KnowledgeCreateTemplate) => void;
}) {
  const importAction = () =>
    props.onImport ? (
      <Button size="sm" variant="primary" disabled={props.importBusy} onClick={() => props.onImport?.()}>
        Import from project root
      </Button>
    ) : undefined;

  const createAction = () =>
    props.onCreate ? (
      <Button size="sm" variant="secondary" onClick={() => props.onCreate?.()}>
        Add evidence
      </Button>
    ) : undefined;

  return (
    <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
      <Show
        when={props.onCreateFromTemplate}
        fallback={
          <PageEmpty
            title="No evidence yet"
            mood="sleeping"
            action={
              props.onImport || props.onCreate ? (
                <div class="flex flex-wrap items-center justify-center gap-2">
                  {importAction()}
                  {createAction()}
                </div>
              ) : undefined
            }
          />
        }
      >
        <PageEmpty title="No evidence yet" mood="sleeping" action={importAction()}>
          <KnowledgeTemplateGrid kind="evidence" showLabel={false} limit={3} onSelect={(template) => props.onCreateFromTemplate?.(template)} />
        </PageEmpty>
      </Show>
    </div>
  );
}

export function evidenceFilterEmpty() {
  return <PageEmpty title="No matches" mood="lost" />;
}
