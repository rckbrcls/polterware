import { createSignal, Index, Show } from "solid-js";
import { Button, SwitchRow, Input, PageContent, PageHeader } from "@polterware/frontend-design-system";
import type { ViewEditorNode } from "./view-editor-helpers";

export type ViewEditorDraft = {
  id?: string;
  name: string;
  memberIds: string[];
};

export function ViewEditor(props: {
  viewId?: string;
  name?: string;
  initialMemberIds?: readonly string[];
  availableNodes: readonly ViewEditorNode[];
  onClose?: () => void;
  onSave?: (draft: ViewEditorDraft) => void | Promise<void>;
}) {
  const [name, setName] = createSignal(props.name ?? "");
  const [included, setIncluded] = createSignal(new Set(props.initialMemberIds ?? []));
  const [saving, setSaving] = createSignal(false);
  const canSave = () => name().trim().length > 0 && !saving();

  function toggleMember(id: string, checked: boolean) {
    setIncluded((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleSave() {
    const trimmed = name().trim();
    if (!trimmed) return;
    setSaving(true);
    void Promise.resolve(props.onSave?.({
      id: props.viewId,
      name: trimmed,
      memberIds: [...included()],
    })).then(() => {
      props.onClose?.();
    }).catch(() => undefined).finally(() => {
      setSaving(false);
    });
  }

  return (
    <div class="absolute inset-0 z-10 flex h-full min-h-0 flex-col bg-[var(--color-surface)]">
      <PageHeader
        title={props.viewId ? `Edit view: ${name() || "Untitled"}` : "Create view"}
        actions={
          <>
            <Button size="sm" variant="texture" onClick={() => props.onClose?.()}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!canSave()} onClick={handleSave}>
              Save
            </Button>
          </>
        }
      />
      <PageContent class="space-y-3 p-4 text-[12.5px]">
        <label class="block text-[12px] text-[var(--color-text-secondary)]">
          Name
          <Input
            size="sm"
            class="mt-1 w-full max-w-md"
            value={name()}
            placeholder="View name"
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <div>
          <p class="m-0 mb-2 text-[12px] font-medium">Included components</p>
          <Show
            when={props.availableNodes.length > 0}
            fallback={
              <p class="m-0 text-[12.5px] text-[var(--color-text-muted)]">
                No components on the canvas yet.
              </p>
            }
          >
            <Index each={props.availableNodes}>
              {(node) => (
                <SwitchRow
                  checked={included().has(node().id)}
                  label={node().name}
                  onCheckedChange={(checked) => toggleMember(node().id, checked)}
                />
              )}
            </Index>
          </Show>
        </div>
      </PageContent>
    </div>
  );
}
