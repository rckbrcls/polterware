/**
 * English skill body for agents without the Polterware plugin. It points at the
 * commands that describe themselves (`polterware format`, `brief`, `--help`) so it
 * never drifts from the binary; `polterware setup claude|codex` installs the full plugin.
 */
export const POLTERWARE_AI_SKILL_MARKDOWN = `# Polterware project context

This project is tracked by Polterware, a local store of the project's Work cards, Structure, Decisions, Facts, and change history. Read it through the \`polterware\` CLI (or the Polterware MCP server) instead of guessing.

1. Start a session with \`polterware status\`.
2. Before you work on a card, a Structure node, or a file, read \`polterware brief <slug|path|file>\`: the Rules you must follow, open tasks and questions, the decisions that govern it, scope facts, and the milestone, in one read.
3. Find anything with \`polterware search <terms>\`.
4. Write Work cards, Decisions, and Facts in Polter format: \`polterware format\` prints the core rules (topics: \`structure\`, \`decisions\`, \`facts\`, \`feature\`); then \`polterware apply <file|-> --dry-run\` and apply. Every write needs a summary and a rationale.
5. End with \`polterware handoff --card <slug> --note "..."\`.

Over MCP the server has four tools: \`polter.query\` for the same reads ("brief …", "search …", "show <id>", "drift"), \`polter.format\`, \`polter.apply\` for Polter writes, and \`doc.upsert\` for docs with a Markdown body. \`polterware --help\` lists every command.

\`polterware setup claude\` or \`polterware setup codex\` installs the full plugin: this skill with the format embedded, the hooks, and the MCP server.

Polterware never stores credentials; do not ask it for secrets. Drift findings are advisory: never overwrite project truth from a finding alone.
`;

export const POLTERWARE_AI_SKILL_FILENAME = "polterware-ai-skill.md";
