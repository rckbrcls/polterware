import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { A11yDialog, Button, Field, FormStack, Input, Select, TagPicker } from "@polterware/frontend-design-system";
import type { DocType, ScopeNodeItem } from "@polterware/feature-shell";
import { DOC_TYPES, docTypeOptions } from "./doc-type";
import { ScopePicker } from "./scope-picker";

export type NewDocInput = { title: string; docType: DocType; tags: string[]; path?: string; scopePath?: string };

/** One dialog to add a doc: a markdown note of a type, optionally backed by a file path. */
export function AddDocDialog(props: {
  open: boolean;
  onClose: () => void;
  onCreate?: (input: NewDocInput) => void;
  tagSuggestions?: readonly string[];
  scopeNodes?: ScopeNodeItem[];
  /** Structure node path preselected for the new item; empty is the whole project. */
  defaultScopePath?: string;
  onImportProjectSources?: () => void;
  importBusy?: boolean;
}) {
  const [title, setTitle] = createSignal("");
  const [docType, setDocType] = createSignal<DocType>("doc");
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
    setDocType("doc");
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
    props.onCreate?.({ title: title().trim(), docType: docType(), tags: tags(), ...(trimmedPath ? { path: trimmedPath } : {}), ...(scopePath() ? { scopePath: scopePath() } : {}) });
    reset();
  }

  return (
    <A11yDialog
      open={props.open}
      title="Add doc"
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
          <Button size="sm" variant="texture" onClick={close}>
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
            placeholder="Deploy the API"
            onInput={(event) => setTitle(event.currentTarget.value)}
          />
        </Field>
        <Field label="Type" hint={DOC_TYPES.find((type) => type.id === docType())?.description}>
          <Select
            options={docTypeOptions()}
            value={docType()}
            onChange={(value) => setDocType(DOC_TYPES.some((type) => type.id === value) ? (value as DocType) : "doc")}
            aria-label="Doc type"
          />
        </Field>
        <Field label="Tags" hint="Optional labels, e.g. api, recovery">
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
          <Field label="Scope" hint="Optional. Leave on Whole project to show it under every filter">
            <ScopePicker nodes={props.scopeNodes ?? []} value={scopePath()} onChange={setScopePath} class="w-full" />
          </Field>
        </Show>
      </FormStack>
    </A11yDialog>
  );
}
