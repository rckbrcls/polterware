import type { IconTileTone } from "@polterware/frontend-design-system";

export type KnowledgePromptKind = "card" | "decision" | "doc";

export type KnowledgeAgentPrompt = {
  id: string;
  kind: KnowledgePromptKind;
  title: string;
  description: string;
  tone: IconTileTone;
  prompt: string;
};

/** Every prompt starts from the project's own state, so the agent learns the grammar instead of the prompt teaching it. */
const PREAMBLE =
  "Run `polterware format` once to learn the Polter grammar and `polterware status` to read the current project state.";
const CLOSING =
  "Write it as Polter text with a clear summary and rationale, check it with `polterware apply --dry-run`, then apply it with `polterware apply`. Only change what you can back with the code.";

const CARD_PROMPTS: KnowledgeAgentPrompt[] = [
  {
    id: "prompt-card-open-work",
    kind: "card",
    title: "Find open work",
    description: "Turn TODOs, issues, and recent commits into cards.",
    tone: "execution",
    prompt: `${PREAMBLE}

Read the TODO and FIXME comments, open issues, and recent commits of this project, then propose Work cards for the work that is still open. Put each card under the component it changes and start it in the shape stage. Skip anything that already has a card (\`polterware query cards\`).

${CLOSING}`,
  },
  {
    id: "prompt-card-break-down",
    kind: "card",
    title: "Break down a goal",
    description: "Split an objective into cards with tasks.",
    tone: "architecture",
    prompt: `${PREAMBLE}

My goal is: <describe the goal here>.

Break it into Work cards with a small intent paragraph and checkable tasks (\`- [ ] T1 ...\`) each. Put each card under the component it changes, list the open questions with \`?\`, and record the contract invariants with \`!\`.

${CLOSING}`,
  },
  {
    id: "prompt-card-plan-existing",
    kind: "card",
    title: "Detail a card",
    description: "Add tasks, risks, and open questions to a card.",
    tone: "identity",
    prompt: `${PREAMBLE}

Pick the card in the shape or plan stage that is most ready (\`polterware query cards\`), read it with \`polterware query card <slug>\`, and read the code it touches. Add concrete tasks with their scope, the open questions, and the invariants it must keep. Do not move it forward a stage.

${CLOSING}`,
  },
];

const DECISION_PROMPTS: KnowledgeAgentPrompt[] = [
  {
    id: "prompt-decision-extract",
    kind: "decision",
    title: "Extract decisions",
    description: "Record the decisions this code already reflects.",
    tone: "architecture",
    prompt: `${PREAMBLE}

Read the code, configuration, and documentation and find the architectural decisions this project has already made (frameworks, data stores, boundaries, deployment). Record each as a proposed Decision with its context, decision, and consequences, scoped to the Structure node it applies to. Check \`polterware query decisions\` first and do not repeat one.

${CLOSING}`,
  },
  {
    id: "prompt-decision-principles",
    kind: "decision",
    title: "Propose principles",
    description: "Draft project-wide rules inferred from the code.",
    tone: "security",
    prompt: `${PREAMBLE}

Infer three to five project-wide principles from how this code is actually written (error handling, dependency rules, testing, naming, boundaries). Propose each as a Decision with no scope, so it applies to the whole project, and give the evidence for it in the body so I can accept or reject it.

${CLOSING}`,
  },
  {
    id: "prompt-decision-review",
    kind: "decision",
    title: "Review decisions",
    description: "Challenge decisions the code now contradicts.",
    tone: "observability",
    prompt: `${PREAMBLE}

Read the active Decisions (\`polterware query decisions active\`) and compare each with the code. For every Decision the code contradicts, set \`status: challenged\` with a \`reason:\` that names the files that disagree. Leave the Decisions the code still follows alone.

${CLOSING}`,
  },
];

const DOC_PROMPTS: KnowledgeAgentPrompt[] = [
  {
    id: "prompt-doc-facts",
    kind: "doc",
    title: "Record facts",
    description: "Declare what the code shows and link its evidence.",
    tone: "knowledge",
    prompt: `${PREAMBLE}

Read the registered docs (documents, runbooks, and sources) and the code. Record the important facts about this project as Facts: what it is built with, how it runs, and what it depends on. Set the kind to observed when you saw it in the code, and link each Fact to the existing evidence ids that back it. Scope each Fact to the Structure node it describes.

${CLOSING}`,
  },
  {
    id: "prompt-doc-verify",
    kind: "doc",
    title: "Back unverified facts",
    description: "Find Facts without evidence and support them.",
    tone: "execution",
    prompt: `${PREAMBLE}

Run \`polterware inbox\` and take the Verify items: Facts that have no evidence. For each one, check the code and the registered evidence. When something backs it, link it by listing its evidence id on the Fact. When the Fact is wrong or stale, update the statement instead of linking.

${CLOSING}`,
  },
  {
    id: "prompt-doc-gaps",
    kind: "doc",
    title: "Find doc gaps",
    description: "List the important files not registered as docs.",
    tone: "data",
    prompt: `${PREAMBLE}

Compare the registered docs with the project tree and list the files that should be docs but are not: READMEs, API contracts, infrastructure definitions, runbooks, and architecture docs. Do not write anything. Give me the paths and why each one matters, so I can import them from the Docs page.`,
  },
];

export const KNOWLEDGE_AGENT_PROMPTS: KnowledgeAgentPrompt[] = [
  ...CARD_PROMPTS,
  ...DECISION_PROMPTS,
  ...DOC_PROMPTS,
];

export function knowledgePromptsForKind(kind: KnowledgePromptKind): KnowledgeAgentPrompt[] {
  return KNOWLEDGE_AGENT_PROMPTS.filter((prompt) => prompt.kind === kind);
}
