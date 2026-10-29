export type CanonFactTruthClass = "declared" | "observed" | "inferred" | "verified";

export type CanonFactRow = {
  id: string;
  projectId: string;
  statement: string;
  truthClass: string;
  source: string;
  actor: string;
  entityId: string;
  /** Structure node the Fact is scoped to; empty is the whole project. */
  scopeNodeId: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CanonEvidenceRow = {
  id: string;
  projectId: string;
  kind: string;
  summary: string;
  source: string;
  path: string;
  actor: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CanonFactDetail = {
  fact: CanonFactRow;
  evidence: CanonEvidenceRow[];
};

export type CanonFactDraft = {
  id?: string;
  statement: string;
  truthClass: CanonFactTruthClass;
  entityId: string;
};

export type CanonEvidenceDraft = {
  kind: string;
  summary: string;
  path: string;
  linkToSelectedFact: boolean;
};

export const CANON_TRUTH_CLASS_OPTIONS: Array<{ value: CanonFactTruthClass; label: string }> = [
  { value: "declared", label: "Declared" },
  { value: "observed", label: "Observed" },
  { value: "inferred", label: "Inferred" },
  { value: "verified", label: "Verified" },
];

export const CANON_EVIDENCE_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "file", label: "File" },
  { value: "observation", label: "Observation" },
  { value: "test", label: "Test" },
  { value: "commit", label: "Commit" },
  { value: "other", label: "Other" },
];
