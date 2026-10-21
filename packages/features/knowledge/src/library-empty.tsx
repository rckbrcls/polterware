import { Button, PageEmpty } from "@polterware/frontend-design-system";
import { Show } from "solid-js";
import type { KnowledgeCreateTemplate } from "./create-templates";
import { KnowledgeTemplateGrid } from "./knowledge-template-grid";

export function LibraryEmpty(props: {
  onCreate?: () => void;
  onCreateFromTemplate?: (template: KnowledgeCreateTemplate) => void;
}) {
  return (
    <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
      <Show
        when={props.onCreateFromTemplate}
        fallback={
          <PageEmpty
            title="No Verdicts yet."
            action={
              props.onCreate ? (
                <Button size="sm" variant="primary" onClick={() => props.onCreate?.()}>
                  New Verdict
                </Button>
              ) : undefined
            }
          />
        }
      >
        <KnowledgeTemplateGrid kind="verdict" showLabel={false} onSelect={(template) => props.onCreateFromTemplate?.(template)} />
      </Show>
    </div>
  );
}

export function libraryFilterEmpty() {
  return (
    <PageEmpty
      title="No Verdicts match"
      description="Try another search or clear active filters."
    />
  );
}
