import { Button, PageEmpty } from "@polterware/frontend-design-system";
import { KnowledgePromptGrid } from "./knowledge-prompt-grid";

export function WorkCardsEmpty(props: { onCreate?: () => void }) {
  return (
    <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
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
      >
        <KnowledgePromptGrid kind="card" />
      </PageEmpty>
    </div>
  );
}

export function workCardsFilterEmpty() {
  return <PageEmpty title="No matches" mood="lost" />;
}
