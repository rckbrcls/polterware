import { Button, PageEmpty } from "@polterware/frontend-design-system";
import { KnowledgePromptGrid } from "./knowledge-prompt-grid";

export function EvidenceEmpty(props: {
  onCreate?: () => void;
  onImport?: () => void;
  importBusy?: boolean;
}) {
  const action = () =>
    props.onImport || props.onCreate ? (
      <div class="flex flex-wrap items-center justify-center gap-2">
        {props.onImport ? (
          <Button size="sm" variant="primary" disabled={props.importBusy} onClick={() => props.onImport?.()}>
            Import from project root
          </Button>
        ) : null}
        {props.onCreate ? (
          <Button size="sm" variant="secondary" onClick={() => props.onCreate?.()}>
            Add evidence
          </Button>
        ) : null}
      </div>
    ) : undefined;

  return (
    <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
      <PageEmpty title="No evidence yet" mood="sleeping" action={action()}>
        <KnowledgePromptGrid kind="evidence" />
      </PageEmpty>
    </div>
  );
}

export function evidenceFilterEmpty() {
  return <PageEmpty title="No matches" mood="lost" />;
}
