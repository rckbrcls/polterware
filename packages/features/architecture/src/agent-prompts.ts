import type { IconTileTone } from "@polterware/frontend-design-system";

export type StructureAgentPrompt = {
  id: string;
  title: string;
  description: string;
  tone: IconTileTone;
  level: "system" | "domain" | "component";
  prompt: string;
};

const PREAMBLE =
  "Run `polterware format` once to learn the Polter grammar and `polterware status` to read the current project state.";
const CLOSING =
  "Write it as Polter text with a clear summary and rationale, check it with `polterware apply --dry-run`, then apply it with `polterware apply`. Only add what you can back with the code.";

export const STRUCTURE_AGENT_PROMPTS: StructureAgentPrompt[] = [
  {
    id: "prompt-structure-map",
    title: "Map the project",
    description: "Propose systems, domains, and components from the repo.",
    tone: "architecture",
    level: "system",
    prompt: `${PREAMBLE}

Read this repository and propose its Structure: the top-level systems, the domains inside them, and the components that make them up (\`# path: Title\` with \`level:\` and \`under:\`). Point each node's \`path:\` at the folder that holds it and add a one-line intent. Check \`polterware query structure\` first and do not repeat a node that exists.

${CLOSING}`,
  },
  {
    id: "prompt-structure-dependencies",
    title: "Map dependencies",
    description: "Record which components use which.",
    tone: "data",
    level: "component",
    prompt: `${PREAMBLE}

Read the existing Structure (\`polterware query structure\`) and the imports, API calls, and shared packages between its components. Fill in \`uses:\` on each component with the node paths it depends on, so the map draws the edges. Do not add nodes in this pass.

${CLOSING}`,
  },
  {
    id: "prompt-structure-deploys",
    title: "Register deploys",
    description: "Link components to where they run per environment.",
    tone: "infrastructure",
    level: "component",
    prompt: `${PREAMBLE}

Read the deployment config of this project (CI workflows, Dockerfiles, platform config files) and the existing Structure. For each component that is deployed, set \`deploys:\` as \`env=provider:resource\` using the project's environments. Leave components without a deploy target alone.

${CLOSING}`,
  },
];
