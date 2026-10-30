import { Index, Show, createEffect, createSignal, on, type JSX } from "solid-js";
import { Button } from "./button";
import { ExpandIcon } from "./hugeicons";
import { A11yDialog } from "./dialog";
import { PropertyPills, type ComposerProperty } from "./property-pills";
import { Switch } from "./switch";
import "./composer.css";

export type { ComposerProperty, ComposerSingleProperty, ComposerTokensProperty } from "./property-pills";

/** A short labelled text field under the description, such as a file path. */
export type ComposerField = {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

/** What a person typed; the host adds the properties it owns. */
export type ComposerDraft = { title: string; description: string; why: string };

export type ComposerProps = {
  open: boolean;
  onClose: () => void;
  /** Where the record goes, such as ["Polterware", "New card"]; the last part names the dialog. */
  crumbs: readonly string[];
  titlePlaceholder: string;
  /** Leave it out to hide the description. */
  descriptionPlaceholder?: string;
  properties?: readonly ComposerProperty[];
  /** Labelled text fields under the description, such as a file path. */
  fields?: readonly ComposerField[];
  /** A quiet action at the start of the footer, such as an import. */
  footerAction?: JSX.Element;
  submitLabel: string;
  /**
   * Writes the draft. Resolving false keeps it (the write failed); anything else clears
   * it and closes the composer, unless Create more is on.
   */
  onSubmit: (draft: ComposerDraft) => Promise<boolean | void> | boolean | void;
  /** Values the fields start from each time it opens, such as a fact being edited. */
  initial?: Partial<ComposerDraft>;
  /** False hides Create more, for an edit. Defaults to true. */
  createMore?: boolean;
  /** Leave it out to hide the reason field. */
  whyPlaceholder?: string;
  /** Opens the record's own page, for an edit of a record that has one: an Expand button beside Close. */
  onExpand?: () => void;
};

/**
 * Linear's composer: the title comes first, then an optional description, property
 * pills, and an optional reason recorded in Activity. ⌘Enter creates; Create more keeps
 * it open, with the properties, for the next one.
 */
export function Composer(props: ComposerProps) {
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [why, setWhy] = createSignal("");
  const [createMore, setCreateMore] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let titleInput: HTMLTextAreaElement | undefined;
  let descriptionInput: HTMLTextAreaElement | undefined;

  const heading = () => props.crumbs[props.crumbs.length - 1] ?? props.submitLabel;
  const canSubmit = () => title().trim().length > 0 && !busy();

  function reset() {
    setTitle(props.initial?.title ?? "");
    setDescription(props.initial?.description ?? "");
    setWhy(props.initial?.why ?? "");
  }

  createEffect(on(() => props.open, (open) => { if (open) reset(); }));

  async function submit() {
    if (!canSubmit()) return;
    setBusy(true);
    try {
      const written = await props.onSubmit({ title: title().trim(), description: description().trim(), why: why().trim() });
      if (written === false) return;
      if (createMore() && props.createMore !== false) {
        setTitle("");
        setDescription("");
        setWhy("");
        queueMicrotask(() => titleInput?.focus());
      } else {
        props.onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <A11yDialog
      open={props.open}
      title={heading()}
      size="lg"
      chrome="flush"
      bodyClass="pw-composer__body"
      onClose={() => { if (!busy()) props.onClose(); }}
      initialFocus={() => titleInput}
      // The property pickers are portalled popovers with a search field.
      trapFocus={false}
      footer={
        <>
          <div class="pw-composer__footer-start">
            <Show when={props.createMore !== false}>
              <span class="pw-composer__create-more">
                <Switch size="sm" checked={createMore()} onCheckedChange={setCreateMore} aria-label="Create more" />
                <span aria-hidden onClick={() => setCreateMore((value) => !value)}>Create more</span>
              </span>
            </Show>
            {props.footerAction}
          </div>
          <Button size="sm" variant="primary" disabled={!canSubmit()} onClick={() => void submit()}>
            {props.submitLabel}
          </Button>
        </>
      }
    >
      <Show when={props.onExpand}>
        <Button class="pw-composer__expand" size="icon" variant="ghost" aria-label="Expand" onClick={() => props.onExpand?.()}>
          <ExpandIcon size={14} />
        </Button>
      </Show>
      <div class="pw-composer" classList={{ "pw-composer--expandable": Boolean(props.onExpand) }} onKeyDown={onKeyDown}>
        {/* A one-line value that wraps: Enter moves on, and pasted line breaks become spaces. */}
        <textarea
          ref={titleInput}
          rows={1}
          class="pw-composer__title"
          aria-label="Title"
          placeholder={props.titlePlaceholder}
          value={title()}
          spellcheck={false}
          autocomplete="off"
          onInput={(event) => {
            const value = event.currentTarget.value;
            if (value.includes("\n")) event.currentTarget.value = value.replace(/\s*\n+\s*/g, " ");
            setTitle(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.isComposing) return;
            event.preventDefault();
            if (descriptionInput) descriptionInput.focus();
            else void submit();
          }}
        />
        <Show when={props.descriptionPlaceholder}>
          <textarea
            ref={descriptionInput}
            class="pw-composer__description"
            aria-label="Description"
            rows={3}
            placeholder={props.descriptionPlaceholder}
            value={description()}
            spellcheck={false}
            onInput={(event) => setDescription(event.currentTarget.value)}
          />
        </Show>
        <Index each={props.fields}>
          {(field) => (
            <label class="pw-composer__field">
              <span class="pw-composer__field-label">{field().label}</span>
              <input
                class="pw-composer__field-input"
                aria-label={field().label}
                placeholder={field().placeholder}
                value={field().value}
                spellcheck={false}
                autocomplete="off"
                onInput={(event) => field().onChange(event.currentTarget.value)}
              />
            </label>
          )}
        </Index>
        <Show when={(props.properties?.length ?? 0) > 0}>
          <PropertyPills class="pw-composer__properties" properties={props.properties ?? []} />
        </Show>
        <Show when={props.whyPlaceholder}>
          <label class="pw-composer__field">
            <span class="pw-composer__field-label">Why</span>
            <input
              class="pw-composer__field-input"
              aria-label="Why"
              placeholder={props.whyPlaceholder}
              value={why()}
              spellcheck={false}
              autocomplete="off"
              onInput={(event) => setWhy(event.currentTarget.value)}
            />
          </label>
        </Show>
      </div>
    </A11yDialog>
  );
}
