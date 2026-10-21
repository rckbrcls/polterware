import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { A11yDialog, Button, Field, FormStack, Input, TagPicker } from "@polterware/frontend-design-system";
import type { ScopeNodeItem } from "@polterware/feature-shell";
import { ScopePicker } from "./scope-picker";
import type { KnowledgeCreateTemplate } from "./create-templates";
import { KnowledgeTemplateGrid } from "./knowledge-template-grid";

export type NewEvidenceInput = { title: string; tags: string[]; path?: string; scopePath?: string };

/** One dialog to add Evidence: a markdown note, optionally backed by a file path, described only by tags. */
export function AddEvidenceDialog(props: {
  open: boolean;
  onClose: () => void;
  onCreate?: (input: NewEvidenceInput) => void;
  tagSuggestions?: readonly string[];
  scopeNodes?: ScopeNodeItem[];
  /** Atlas node path preselected for the new item; empty is the whole project. */
  defaultScopePath?: string;
  onImportProjectSources?: () => void;
  importBusy?: boolean;
  onCreateFromTemplate?: (template: KnowledgeCreateTemplate) => void;
}) {
  const [title, setTitle] = createSignal("");
  const [path, setPath] = createSignal("");
  const [tags, setTags] = createSignal<string[]>([]);
  const [scopePath, setScopePath] = createSignal("");

  createEffect(() => {
    if (props.open) reset();
  });

  const tagOptions = createMemo(() =>
    [...new Set([...(props.tagSuggestions ?? []), ...tags()])].map((name) => ({ id: name, name })),
  );
  const canSubmit = () => title().trim().length > 0;

  function reset() {
    setTitle("");
    setPath("");
    setTags([]);
    setScopePath(props.defaultScopePath ?? "");
  }

  function close() {
    reset();
    props.onClose();
  }

  function submit() {
    if (!canSubmit()) return;
    const trimmedPath = path().trim();
    props.onCreate?.({ title: title().trim(), tags: tags(), ...(trimmedPath ? { path: trimmedPath } : {}), ...(scopePath() ? { scopePath: scopePath() } : {}) });
    reset();
  }

  return (
    <A11yDialog
      open={props.open}
      title="Add evidence"
      size="lg"
      onClose={close}
      footer={
        <>
          <Show when={props.onImportProjectSources}>
            <Button
              size="sm"
              variant="ghost"
              disabled={props.importBusy}
              onClick={() => props.onImportProjectSources?.()}
            >
              Import from project root
            </Button>
          </Show>
          <Button size="sm" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={!canSubmit()} onClick={submit}>
            Create
          </Button>
        </>
      }
    >
      <FormStack>
        <Field label="Title">
          <Input
            size="sm"
            value={title()}
            placeholder="Deploy runbook"
            onInput={(event) => setTitle(event.currentTarget.value)}
          />
        </Field>
        <Field label="Tags" hint="Describe it with tags, e.g. runbook, documentation, source">
          <TagPicker
            tags={tagOptions()}
            selectedIds={tags()}
            onChange={(ids) => setTags([...ids])}
            onCreate={async (name) => name.trim() || undefined}
          />
        </Field>
        <Field label="Path" hint="Optional. A file relative to the project root, e.g. README.md or infra/main.tf">
          <Input
            size="sm"
            value={path()}
            placeholder="README.md"
            onInput={(event) => setPath(event.currentTarget.value)}
          />
        </Field>
        <Show when={(props.scopeNodes?.length ?? 0) > 0}>
          <Field label="Atlas scope" hint="Optional. Leave on Whole project to show it under every filter">
            <ScopePicker nodes={props.scopeNodes ?? []} value={scopePath()} onChange={setScopePath} class="w-full" />
          </Field>
        </Show>
        {props.onCreateFromTemplate ? (
          <KnowledgeTemplateGrid
            kind="evidence"
            onSelect={(template) => {
              props.onCreateFromTemplate?.(template);
              reset();
            }}
          />
        ) : null}
      </FormStack>
    </A11yDialog>
  );
}
