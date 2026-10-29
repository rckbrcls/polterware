import { For, Show } from "solid-js";
import { Button, ScrollText, StatusChip } from "@polterware/frontend-design-system";
import { KnowledgeDocumentProperty } from "./knowledge-document-properties";
import { KnowledgeDocumentNotFound, KnowledgeDocumentShell } from "./knowledge-document-shell";
import type { CanonFactDetail } from "./canon-facts-types";
import { factKindLabel, factKindTone } from "./fact-kind";

/** A stored RFC3339 time as a short local date; an unreadable value is shown as is. */
function formatInstant(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** One Fact as a page: the statement as title, its evidence in the column, and its provenance in the rail. */
export function FactDetail(props: {
  detail: CanonFactDetail | undefined;
  subject: string;
  scope: string;
  scopePath?: string;
  busy?: boolean;
  onEdit?: () => void;
  onLinkEvidence?: () => void;
}) {
  return (
    <Show when={props.detail} fallback={<KnowledgeDocumentNotFound kindLabel="Fact" />}>
      {(detail) => (
        <KnowledgeDocumentShell
          trail={[{ label: "Truth", section: "truth" }, { label: "Facts", section: "truth", tab: "facts" }]}
          entityId={detail().fact.id}
          title={detail().fact.statement || detail().fact.id}
          icon={<ScrollText size={32} />}
          properties={
            <>
              <KnowledgeDocumentProperty label="Kind">
                <StatusChip tone={factKindTone(detail().fact.truthClass)} label={factKindLabel(detail().fact.truthClass)} />
              </KnowledgeDocumentProperty>
              <KnowledgeDocumentProperty label="Subject">{props.subject || "Whole project"}</KnowledgeDocumentProperty>
              <KnowledgeDocumentProperty label="Scope">
                <span title={props.scopePath}>{props.scope || "Whole project"}</span>
              </KnowledgeDocumentProperty>
              <KnowledgeDocumentProperty label="Origin" show={Boolean(detail().fact.source)}>{detail().fact.source}</KnowledgeDocumentProperty>
              <KnowledgeDocumentProperty label="Actor" show={Boolean(detail().fact.actor)}>{detail().fact.actor}</KnowledgeDocumentProperty>
              <KnowledgeDocumentProperty label="Updated" show={Boolean(detail().fact.updatedAt)}>{formatInstant(detail().fact.updatedAt)}</KnowledgeDocumentProperty>
              <KnowledgeDocumentProperty label="Id" mono>{detail().fact.id}</KnowledgeDocumentProperty>
            </>
          }
          footerActions={
            <>
              <Show when={props.onEdit}>
                <Button variant="texture" size="sm" disabled={props.busy} onClick={() => props.onEdit?.()}>Edit</Button>
              </Show>
              <Show when={props.onLinkEvidence}>
                <Button variant="texture" size="sm" disabled={props.busy} onClick={() => props.onLinkEvidence?.()}>Link evidence</Button>
              </Show>
            </>
          }
        >
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
        </KnowledgeDocumentShell>
      )}
    </Show>
  );
}
