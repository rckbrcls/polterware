import { Button, PageEmpty } from "@polterware/frontend-design-system";
import { Show } from "solid-js";
import type { KnowledgeCreateTemplate } from "./create-templates";
import { KnowledgeTemplateGrid } from "./knowledge-template-grid";

export function WorkCardsEmpty(props: {
  onCreate?: () => void;
  onCreateFromTemplate?: (template: KnowledgeCreateTemplate) => void;
}) {
  return (
    <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
      <Show
        when={props.onCreateFromTemplate}
        fallback={
          <PageEmpty
            title="No cards yet"
            mood="sleeping"
            action={
              props.onCreate ? (
                <Button size="sm" variant="primary" onClick={() => props.onCreate?.()}>
                  New card
                </Button>
              ) : undefined
            }
          />
        }
      >
        <PageEmpty title="No cards yet" mood="sleeping">
          <KnowledgeTemplateGrid kind="card" showLabel={false} limit={3} onSelect={(template) => props.onCreateFromTemplate?.(template)} />
        </PageEmpty>
      </Show>
    </div>
  );
}

export function workCardsFilterEmpty() {
  return <PageEmpty title="No matches" mood="lost" />;
}
