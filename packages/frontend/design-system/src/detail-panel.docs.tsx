import { createSignal } from "solid-js";
import { Button } from "./button";
import { DetailPanel, DetailPanelCollectionHeader } from "./detail-panel";
import { FileText } from "./hugeicons";
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
          <DetailPanel.Header />
          <DetailPanel.Body>
            <DetailPanel.Main>
              <DetailPanel.Title title="Source import" icon={<FileText size={16} />} meta={<StatusChip tone="syncing">Build</StatusChip>} />
              <DetailPanel.Section title="Description">
                <p>Register project sources as evidence for verified facts.</p>
              </DetailPanel.Section>
              <DetailPanel.Section title="Acceptance criteria" collapsible defaultOpen={false} icon={<FileText size={14} />}>
                <p>Every imported source retains its project-relative path.</p>
              </DetailPanel.Section>
            </DetailPanel.Main>
            <DetailPanel.Rail aria-label="Work properties">
              <DetailPanel.Properties>
                <DetailPanel.Property label="Stage" value="Build" />
                <DetailPanel.Property label="Component" value="Local core" />
                <DetailPanel.Property label="ID" value="source-import" mono />
              </DetailPanel.Properties>
            </DetailPanel.Rail>
          </DetailPanel.Body>
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
    "Compound entity panel with record and document body layouts, keeping identity inside the scrollable content. Collection headers stay above the divided workspace and render inline on standalone pages.",
  exports: ["DetailPanel", "DetailPanelCollectionHeader"],
  examples: [
    { id: "record", title: "Record with properties, resizing, and expansion", wide: true, render: () => <RecordPanel /> },
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
