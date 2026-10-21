import { createSignal } from "solid-js";
import { Button } from "./button";
import { DetailPanel, DetailPanelCollectionHeader } from "./detail-panel";
import { FileText, ListChecks, ListFilter, Settings } from "./hugeicons";
import { MarkdownEditor } from "./markdown-editor";
import { StatusChip } from "./status";
import type { DocEntry } from "./docs/types";

function RecordPanel() {
  const [open, setOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  return (
    // #region record
    <div class="h-[440px] w-full">
      <DetailPanel.Root
        open={open()}
        onOpenChange={setOpen}
        expanded={expanded()}
        onExpandedChange={setExpanded}
        activeEntityId="source-import"
        storageKey="docs.detail-panel.record.width"
        shortcuts={false}
        aria-label="Work card details"
      >
        <DetailPanelCollectionHeader>
          <div class="p-3">Work collection controls remain above both panes.</div>
        </DetailPanelCollectionHeader>
        <DetailPanel.Collection>
          <div class="p-3">
            <Button data-detail-opener onClick={() => setOpen(true)}>Open source import</Button>
          </div>
        </DetailPanel.Collection>
        <DetailPanel.Content>
          <DetailPanel.Header title="Source import" />
          <DetailPanel.Body>
            <DetailPanel.Main>
              <div class="mb-3"><StatusChip tone="syncing">Build</StatusChip></div>
              <DetailPanel.Section title="Description" icon={<FileText size={14} />}>
                <p>Register project sources as evidence for verified facts.</p>
              </DetailPanel.Section>
              <DetailPanel.Section title="Options" icon={<ListFilter size={14} />}>
                <ol class="m-0 grid list-none gap-2 p-0" role="list" aria-label="Options">
                  <li class="flex min-w-0 items-start gap-2"><span class="shrink-0 tabular-nums text-[var(--color-text-muted)]" aria-hidden="true">01</span><span class="min-w-0 [overflow-wrap:anywhere]">Import registered project sources.</span></li>
                  <li class="flex min-w-0 items-start gap-2"><span class="shrink-0 tabular-nums text-[var(--color-text-muted)]" aria-hidden="true">02</span><span class="min-w-0 [overflow-wrap:anywhere]">Review the evidence before importing additional sources.</span></li>
                </ol>
              </DetailPanel.Section>
              <DetailPanel.Section title="Acceptance criteria" collapsible defaultOpen={false} icon={<ListChecks size={14} />}>
                <p>Every imported source retains its project-relative path.</p>
              </DetailPanel.Section>
            </DetailPanel.Main>
            <DetailPanel.Rail aria-label="Work properties">
              <DetailPanel.Section title="Properties" icon={<Settings size={14} />}>
                <DetailPanel.Properties>
                  <DetailPanel.Property label="Stage" value="Build" />
                  <DetailPanel.Property label="Component" value="Local core" />
                  <DetailPanel.Property label="ID" value="source-import" mono />
                </DetailPanel.Properties>
              </DetailPanel.Section>
            </DetailPanel.Rail>
          </DetailPanel.Body>
          <DetailPanel.Footer aria-label="Source actions">
            <Button size="sm" onClick={() => setOpen(false)}><FileText size={14} />Review sources</Button>
          </DetailPanel.Footer>
        </DetailPanel.Content>
      </DetailPanel.Root>
    </div>
    // #endregion
  );
}

function DocumentPanel() {
  const [open, setOpen] = createSignal(false);
  const [value, setValue] = createSignal("## Import evidence\n\nRecord the source path and the facts it supports.");
  return (
    // #region document
    <div class="h-[440px] w-full">
      <DetailPanel.Root
        open={open()}
        onOpenChange={setOpen}
        mode="overlay"
        expandable={false}
        resizable={false}
        shortcuts={false}
        activeEntityId="import-evidence"
        storageKey="docs.detail-panel.document.width"
        aria-label="Evidence document"
      >
        <DetailPanel.Collection>
          <div class="p-3">
            <Button data-detail-opener onClick={() => setOpen(true)}>Open document</Button>
          </div>
        </DetailPanel.Collection>
        <DetailPanel.Content>
          <DetailPanel.Body layout="document">
            <DetailPanel.Title title="Import evidence" icon={<FileText size={16} />} />
            <DetailPanel.Properties variant="inline">
              <DetailPanel.Property label="Kind" value="Document" />
              <DetailPanel.Property label="Scope" value="Local core" />
            </DetailPanel.Properties>
            <MarkdownEditor value={value()} onChange={setValue} aria-label="Evidence document content" />
          </DetailPanel.Body>
        </DetailPanel.Content>
      </DetailPanel.Root>
    </div>
    // #endregion
  );
}

export default {
  name: "DetailPanel",
  group: "Data",
  summary:
    "Compound entity panel with decorative heading icons and main-surface section cards in record layouts and an unchanged Markdown writing surface in document layouts, keeping identity in the fixed header: centered for expandable details and left-aligned for close-only details. Collection headers stay above the divided workspace and render inline on standalone pages.",
  exports: ["DetailPanel", "DetailPanelCollectionHeader"],
  examples: [
    { id: "record", title: "Main-surface sections with properties, resizing, and expansion", wide: true, render: () => <RecordPanel /> },
    { id: "document", title: "Document in a fixed overlay panel", wide: true, render: () => <DocumentPanel /> },
    {
      id: "standalone-header",
      title: "Collection header outside a panel",
      wide: true,
      render: () => (
        // #region standalone-header
        <DetailPanelCollectionHeader>
          <div class="flex items-center gap-3 p-3">
            <span>Evidence collection</span>
            <StatusChip tone="muted">3 sources</StatusChip>
          </div>
        </DetailPanelCollectionHeader>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
