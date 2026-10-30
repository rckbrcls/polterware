import { For, Show, type JSX } from "solid-js";
import { Button, Peek, StatusChip } from "@polterware/frontend-design-system";
import type { CanonFactDetail } from "./canon-facts-types";
import { factKindLabel, factKindTone } from "./fact-kind";

/** A stored RFC3339 time as a short local date; an unreadable value is shown as is. */
function formatInstant(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** One labeled property line of the Fact dialog. */
function FactProperty(props: { label: string; show?: boolean; mono?: boolean; children: JSX.Element }) {
  return <Show when={props.show ?? true}>
    <div class="pw-fact-peek__row"><dt>{props.label}</dt><dd classList={{ "font-mono text-[12px]": props.mono }}>{props.children}</dd></div>
  </Show>;
}

/**
 * One Fact in the shared Peek dialog over the Facts list: the statement as title, its
 * properties, and the evidence that backs it; Edit and Link evidence sit before Close.
 */
export function FactDetail(props: {
  open: boolean;
  detail: CanonFactDetail | undefined;
  subject: string;
  scope: string;
  scopePath?: string;
  busy?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onLinkEvidence?: () => void;
}) {
  return (
    <Peek
      open={props.open}
      title={props.detail ? props.detail.fact.statement || props.detail.fact.id : "Fact"}
      onClose={props.onClose}
      actions={
        <>
          <Show when={props.onEdit && props.detail}>
            <Button variant="texture" disabled={props.busy} onClick={() => props.onEdit?.()}>Edit</Button>
          </Show>
          <Show when={props.onLinkEvidence && props.detail}>
            <Button variant="texture" disabled={props.busy} onClick={() => props.onLinkEvidence?.()}>Link evidence</Button>
          </Show>
        </>
      }
    >
      <Show when={props.detail} fallback={<p class="m-0 text-[13px] text-[var(--color-text-muted)]">This fact no longer exists.</p>}>
        {(detail) => (
          <div class="pw-fact-peek">
            <dl class="pw-fact-peek__properties">
              <FactProperty label="Kind">
                <StatusChip tone={factKindTone(detail().fact.truthClass)} label={factKindLabel(detail().fact.truthClass)} />
              </FactProperty>
              <FactProperty label="Subject">{props.subject || "Whole project"}</FactProperty>
              <FactProperty label="Scope"><span title={props.scopePath}>{props.scope || "Whole project"}</span></FactProperty>
              <FactProperty label="Origin" show={Boolean(detail().fact.source)}>{detail().fact.source}</FactProperty>
              <FactProperty label="Actor" show={Boolean(detail().fact.actor)}>{detail().fact.actor}</FactProperty>
              <FactProperty label="Updated" show={Boolean(detail().fact.updatedAt)}>{formatInstant(detail().fact.updatedAt)}</FactProperty>
              <FactProperty label="Id" mono>{detail().fact.id}</FactProperty>
            </dl>
            <section class="pw-fact-evidence" aria-label="Evidence">
              <h2 class="pw-document__group-title">Evidence</h2>
              <Show
                when={detail().evidence.length > 0}
                fallback={<p class="m-0 text-[13px] text-[var(--color-text-muted)]">Nothing backs this fact yet. Link a commit, a file, or a doc as evidence.</p>}
              >
                <ul class="m-0 flex list-none flex-col gap-2 p-0">
                  <For each={detail().evidence}>
                    {(item) => (
                      <li class="flex min-w-0 items-start gap-2">
                        <StatusChip tone="muted" label={item.kind || "other"} />
                        <div class="min-w-0 flex-1">
                          <p class="m-0 text-[13px] leading-5 text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{item.summary || item.id}</p>
                          <Show when={item.path}>
                            <p class="m-0 truncate font-mono text-[11px] leading-4 text-[var(--color-text-muted)]" title={item.path}>{item.path}</p>
                          </Show>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
          </div>
        )}
      </Show>
    </Peek>
  );
}
