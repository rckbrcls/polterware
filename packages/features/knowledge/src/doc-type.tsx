import { BookOpen, FileText, SourceCodeIcon, type SelectOption } from "@polterware/frontend-design-system";
import type { DocType } from "@polterware/feature-shell";

/** What a doc is, in display order. */
export const DOC_TYPES: readonly { id: DocType; label: string; description: string }[] = [
  { id: "doc", label: "Doc", description: "A document that describes part of the project" },
  { id: "runbook", label: "Runbook", description: "A procedure to operate a component" },
  { id: "source", label: "Source", description: "A registered project file" },
];

export function docTypeLabel(docType: DocType): string {
  return DOC_TYPES.find((type) => type.id === docType)?.label ?? "Doc";
}

export function docTypeIcon(docType: DocType, size = 16) {
  if (docType === "runbook") return <BookOpen size={size} />;
  if (docType === "source") return <SourceCodeIcon size={size} />;
  return <FileText size={size} />;
}

export function docTypeOptions(): SelectOption[] {
  return DOC_TYPES.map((type) => ({ value: type.id, label: type.label, icon: docTypeIcon(type.id, 14) }));
}
