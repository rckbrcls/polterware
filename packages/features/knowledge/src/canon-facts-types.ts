export type CanonFactTruthClass = "declared" | "observed" | "inferred" | "verified";

export type CanonFactRow = {
  id: string;
  projectId: string;
  statement: string;
  truthClass: string;
  source: string;
  actor: string;
  entityId: string;
  /** Structure nodes the Fact is about; none is the whole project. */
  scopeNodeIds: string[];
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
  /** Structure nodes the rule is about; none is the whole project. */
  scopeNodeIds: string[];
  /** Optional reason, recorded as the change rationale. */
  why?: string;
};

export type CanonEvidenceDraft = {
  kind: string;
  summary: string;
  path: string;
  linkToSelectedFact: boolean;
};
