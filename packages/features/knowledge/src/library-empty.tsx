import { Button, PageEmpty } from "@polterware/frontend-design-system";
import { KnowledgePromptGrid } from "./knowledge-prompt-grid";

export function LibraryEmpty(props: { onCreate?: () => void }) {
  return (
    <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
      <PageEmpty
        title="No Verdicts yet"
        mood="sleeping"
        action={
          props.onCreate ? (
            <Button size="sm" variant="primary" onClick={() => props.onCreate?.()}>
              New Verdict
            </Button>
          ) : undefined
        }
      >
        <KnowledgePromptGrid kind="verdict" />
      </PageEmpty>
    </div>
  );
}

export function libraryFilterEmpty() {
  return (
    <PageEmpty
      title="No matches"
      mood="lost"
    />
  );
}
