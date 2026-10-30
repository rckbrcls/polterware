import { Button, PageEmpty } from "@polterware/frontend-design-system";
import { KnowledgePromptGrid } from "./knowledge-prompt-grid";

export function DocsEmpty(props: {
  onCreate?: () => void;
}) {
  const action = () =>
    props.onCreate ? (
      <Button size="sm" variant="primary" onClick={() => props.onCreate?.()}>
        Add doc
      </Button>
    ) : undefined;

  return (
    <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
      <PageEmpty title="No docs yet" mood="sleeping" action={action()}>
        <KnowledgePromptGrid kind="doc" />
      </PageEmpty>
    </div>
  );
}

export function docsFilterEmpty() {
  return <PageEmpty title="No matches" mood="lost" />;
}
