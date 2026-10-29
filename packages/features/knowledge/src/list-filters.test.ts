import { describe, expect, it } from "vitest";
import {
  EMPTY_DOC_LIST_FILTERS,
  EMPTY_CARD_LIST_FILTERS,
  distinctDocTags,
  filterDocs,
  filterWorkCards,
} from "./list-filters";
import type { WorkspaceDoc, WorkspaceWorkCard } from "@polterware/feature-shell";

const card = {
  id: "01J",
  slug: "auth",
  title: "Auth",
  intent: "Login",
  stage: "plan",
  kind: "feature",
  owner: "Ada",
  under: "",
  decisions: [],
  updatedAt: "2026-01-01",
  tasks: [],
  questions: [{ id: "q1", text: "SSO?", blocking: false, options: [], state: "open", answer: "" }],
  invariants: [],
} satisfies WorkspaceWorkCard;

const evidence = {
  id: "ev-1",
  title: "Contracts",
  path: "schemas/local/v1/canon.proto",
  summary: "",
  bodyMarkdown: "",
  docType: "source",
  tags: ["source", "contracts"],
  updatedAt: "2026-01-01",
  owner: "Ada",
  entityLinks: [],
} satisfies WorkspaceDoc;

describe("list-filters", () => {
  it("lists the distinct tags in use", () => {
    expect(distinctDocTags([evidence, { ...evidence, id: "ev-2", tags: ["runbook", "source"] }])).toEqual([
      "contracts",
      "runbook",
      "source",
    ]);
  });

  it("filters cards by stage, open questions, and query", () => {
    expect(filterWorkCards([card], { ...EMPTY_CARD_LIST_FILTERS, stages: ["build"] })).toHaveLength(0);
    expect(filterWorkCards([card], { ...EMPTY_CARD_LIST_FILTERS, stages: ["plan"] })).toHaveLength(1);
    expect(filterWorkCards([card], { ...EMPTY_CARD_LIST_FILTERS, questions: "open" })).toHaveLength(1);
    expect(filterWorkCards([card], { ...EMPTY_CARD_LIST_FILTERS, questions: "clear" })).toHaveLength(0);
    expect(filterWorkCards([card], { ...EMPTY_CARD_LIST_FILTERS, query: "login" })).toHaveLength(1);
  });

  it("filters evidence by tag, linked, and query", () => {
    expect(filterDocs([evidence], { ...EMPTY_DOC_LIST_FILTERS, tags: ["contracts"] })).toHaveLength(1);
    expect(filterDocs([evidence], { ...EMPTY_DOC_LIST_FILTERS, tags: ["contracts", "runbook"] })).toHaveLength(0);
    expect(filterDocs([evidence], { ...EMPTY_DOC_LIST_FILTERS, linked: "linked" })).toHaveLength(0);
    expect(filterDocs([evidence], { ...EMPTY_DOC_LIST_FILTERS, query: "canon.proto" })).toHaveLength(1);
  });
});
