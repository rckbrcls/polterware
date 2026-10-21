// Static manual for the `polterware` CLI.
// Keep in sync with backend/runtimes/cli (output.go usage and each command's FlagSet).

export type CliFlag = {
  name: string;
  value?: string;
  required?: boolean;
  description: string;
};

export type CliCommand = {
  id: string;
  name: string;
  synopsis: string;
  summary: string;
  flags: readonly CliFlag[];
  example: string;
};

export type CliKey = {
  keys: string;
  description: string;
};

export const CLI_DEFAULT_DB =
  "~/Library/Application Support/polterware/local.db";

export const CLI_USAGE = "polterware [-db path] <command> [flags]";

export const CLI_USAGE_FLAGS: readonly CliFlag[] = [
  {
    name: "-db",
    value: "path",
    description: `SQLite database path. Defaults to ${CLI_DEFAULT_DB}, the same database the Desktop uses. Place it before the command.`,
  },
];

const JSON_FLAG: CliFlag = {
  name: "--json",
  description: "Print the result as JSON instead of plain text.",
};

const PROJECT_FLAG: CliFlag = {
  name: "--project",
  value: "id",
  description: "Project id. Defaults to the project whose root contains the current directory.",
};

const AGENT_FLAG: CliFlag = {
  name: "--agent",
  value: "name",
  description: "Agent label. Defaults to $POLTERWARE_AGENT_LABEL.",
};

const AGENT_RUN_FLAG: CliFlag = {
  name: "--agent-run-id",
  value: "id",
  description: "Attach the result to an open AgentRun.",
};

export const CLI_COMMANDS: readonly CliCommand[] = [
  {
    id: "tui",
    name: "polterware",
    synopsis: "polterware [-db path]",
    summary:
      "Interactive status and MCP setup. Requires a terminal; without one it prints usage.",
    flags: [],
    example: "polterware",
  },
  {
    id: "init",
    name: "polterware init",
    synopsis: "polterware init --name <name> [--path <root>] [--id <id>] [--json]",
    summary: "Register a project rooted at a local directory.",
    flags: [
      { name: "--name", value: "name", required: true, description: "Project name." },
      {
        name: "--path",
        value: "root",
        description: "Project root path. Defaults to the current directory.",
      },
      { name: "--id", value: "id", description: "Optional explicit project id." },
      JSON_FLAG,
    ],
    example: 'polterware init --name "My App"',
  },
  {
    id: "scan",
    name: "polterware scan",
    synopsis: "polterware scan --project <id> [--json]",
    summary:
      "Import facts, evidence, and sources from the project root. Prints fact, evidence, source, and skipped counts.",
    flags: [
      { name: "--project", value: "id", required: true, description: "Project id." },
      JSON_FLAG,
    ],
    example: "polterware scan --project <project-id>",
  },
  {
    id: "repo",
    name: "polterware repo",
    synopsis:
      "polterware repo list --project <id> [--json] | add --project <id> --name <name> --path <dir> [--json] | remove --project <id> --name <name>",
    summary:
      "Manage extra local checkouts of one project. The project directory stays the primary checkout; scan records a Git checkpoint for each.",
    flags: [
      { name: "--project", value: "id", required: true, description: "Project id." },
      { name: "--name", value: "name", description: "add, remove: short lowercase checkout name." },
      { name: "--path", value: "dir", description: "add: absolute directory of the checkout." },
      JSON_FLAG,
    ],
    example: "polterware repo add --project <project-id> --name api --path /path/to/api",
  },
  {
    id: "context",
    name: "polterware context",
    synopsis:
      'polterware context "<question>" [--zoom task|component|domain|system] [--budget N] [--project <id>]',
    summary:
      "Compile context for a question within a token budget. Alias of oracle; prints Polter text.",
    flags: [
      {
        name: "--zoom",
        value: "level",
        description: "task, component, domain, or system. Defaults to task.",
      },
      { name: "--budget", value: "N", description: "Token budget. Defaults to 1200." },
      PROJECT_FLAG,
    ],
    example: 'polterware context "how does auth work?" --zoom component',
  },
  {
    id: "oracle",
    name: "polterware oracle",
    synopsis:
      'polterware oracle "<question>" [--zoom task|component|domain|system] [--budget N] [--project <id>]',
    summary: "Answer a question from the project's Atlas and Work state within a token budget.",
    flags: [
      {
        name: "--zoom",
        value: "level",
        description: "task, component, domain, or system. Defaults to task.",
      },
      { name: "--budget", value: "N", description: "Token budget. Defaults to 1200." },
      PROJECT_FLAG,
    ],
    example: 'polterware oracle "what touches billing?" --zoom domain',
  },
  {
    id: "atlas",
    name: "polterware atlas",
    synopsis: "polterware atlas [--node <path>] [--at <point>] [--project <id>] | atlas history",
    summary:
      "Read the Atlas: the whole map, one node, or the map at a point in time. atlas history lists the change batches.",
    flags: [
      { name: "--node", value: "path", description: "Node id or path." },
      {
        name: "--at",
        value: "point",
        description: "A change batch id, an RFC3339 time, a YYYY-MM-DD day, or a commit sha.",
      },
      PROJECT_FLAG,
    ],
    example: "polterware atlas --node backend/domains/work --at 2026-09-01",
  },
  {
    id: "export",
    name: "polterware export",
    synopsis: "polterware export [--dry-run] [--json] [--project <id>]",
    summary:
      "Write Verdict files and the generated AGENTS.md block into every checkout of the project.",
    flags: [
      { name: "--dry-run", description: "Print what would change without writing." },
      PROJECT_FLAG,
      JSON_FLAG,
    ],
    example: "polterware export --dry-run",
  },
  {
    id: "drift",
    name: "polterware drift",
    synopsis:
      "polterware drift --project <id> [--entity <id>] [--agent-run-id <id>] [--json]",
    summary:
      "Check for drift between the project and its architecture, decisions, or specs. Findings are reported, never applied.",
    flags: [
      { name: "--project", value: "id", required: true, description: "Project id." },
      { name: "--entity", value: "id", description: "Optional entity id to check." },
      AGENT_RUN_FLAG,
      JSON_FLAG,
    ],
    example: "polterware drift --project <project-id>",
  },
  {
    id: "apply",
    name: "polterware apply",
    synopsis:
      "polterware apply <file|-> [--dry-run] [--project <id>] [--summary <text>] [--rationale <text>] [--agent-run-id <id>]",
    summary:
      "Write Polter text (Work cards, tasks, questions, invariants) to the store as one audited change. A text only changes what it mentions.",
    flags: [
      { name: "--dry-run", description: "Print the plan without writing." },
      {
        name: "--project",
        value: "id",
        description: "Project id. Defaults to the project whose root contains the current directory.",
      },
      { name: "--summary", value: "text", description: "Change summary. Overrides the frontmatter." },
      { name: "--rationale", value: "text", description: "Change rationale. Overrides the frontmatter." },
      AGENT_RUN_FLAG,
    ],
    example: "polterware apply roadmap.pw.md --dry-run",
  },
  {
    id: "lint",
    name: "polterware lint",
    synopsis: "polterware lint <file|dir|-> [--project <id>]",
    summary:
      "Validate Polter text. Silent on success; prints one line per error with the fix and exits 1. Directories are searched for *.pw.md files.",
    flags: [
      {
        name: "--project",
        value: "id",
        description: "Project id for reference checks. Without a resolvable project, only syntax is checked.",
      },
    ],
    example: "polterware lint roadmap.pw.md",
  },
  {
    id: "format",
    name: "polterware format",
    synopsis: "polterware format",
    summary: "Print the Polter format spec, short enough to teach an agent in one read.",
    flags: [],
    example: "polterware format",
  },
  {
    id: "query",
    name: "polterware query",
    synopsis:
      'polterware query "cards" | "card <slug>" | "status" | "inbox" | "handoff <slug>" | "oracle <path>" | "atlas [<path>] [at <point>]" | "atlas history" | "decisions [state]" | "decision <verdict>" | "feature <slug> [step]" | "verify <slug>" [--project <id>]',
    summary:
      "Read project state in Polter format: cards, one card, status, inbox, handoffs, Atlas, decisions, feature steps, or verification.",
    flags: [
      {
        name: "--project",
        value: "id",
        description: "Project id. Defaults to the project whose root contains the current directory.",
      },
    ],
    example: "polterware query cards",
  },
  {
    id: "status",
    name: "polterware status",
    synopsis: "polterware status [--project <id>]",
    summary:
      "Current card, branch, last handoff on that branch, open questions (blocking first), and stage. Start a session with this.",
    flags: [PROJECT_FLAG],
    example: "polterware status",
  },
  {
    id: "handoff",
    name: "polterware handoff",
    synopsis: 'polterware handoff [--card <slug>] [--note "..."] [--project <id>]',
    summary:
      "Write a handoff for the card and current branch, cross-checked against the local diff. End a session with this.",
    flags: [
      {
        name: "--card",
        value: "slug",
        description: "Work card slug. Defaults to the card for this branch, or the only card.",
      },
      {
        name: "--note",
        value: "text",
        description: "Session note: Goal, Done, In progress, Next, Touched, Open question, or free text.",
      },
      PROJECT_FLAG,
    ],
    example: 'polterware handoff --note "Goal: ship quit dialog. Next: docs."',
  },
  {
    id: "task",
    name: "polterware task",
    synopsis: "polterware task claim|done|release <slug>#T2 [--agent <name>] [--project <id>]",
    summary: "Claim, finish, or release one task of a Work card for the session agent.",
    flags: [AGENT_FLAG, PROJECT_FLAG],
    example: "polterware task claim my-card#T2",
  },
  {
    id: "decision",
    name: "polterware decision",
    synopsis:
      'polterware decision list [state] | show <verdict> | propose "<title>" | activate <verdict> | challenge <verdict> --reason "..." | supersede <verdict> (--by <verdict> | --title "...") | trigger <verdict> "..."',
    summary: "Read and move Decisions (Verdicts) through their lifecycle.",
    flags: [
      { name: "--reason", value: "text", description: "challenge: why the decision moves." },
      { name: "--trigger", value: "text", description: "Review trigger." },
      { name: "--body", value: "text", description: "Verdict text, plain (no # headings)." },
      { name: "--by", value: "verdict", description: "supersede: the decision that supersedes." },
      { name: "--title", value: "text", description: "supersede: title of a new superseding decision." },
      AGENT_FLAG,
      PROJECT_FLAG,
    ],
    example: 'polterware decision propose "Use one local core per database"',
  },
  {
    id: "feature",
    name: "polterware feature",
    synopsis:
      'polterware feature new "<intent>" [--title "..."] [--under <node>] [--architecture] | shape <slug> | contract <slug> [--accept] | plan <slug> [--approve]',
    summary:
      "Walk the new-feature flow. new writes a card in shape and prints its impact; shape, contract, and plan print a step, and --accept or --approve pass its gate.",
    flags: [
      { name: "--title", value: "text", description: "new: card title. Defaults to the intent's first sentence." },
      { name: "--under", value: "node", description: "new: component path the feature lives under." },
      { name: "--architecture", description: "new: mark the card as an Architecture Change." },
      { name: "--accept", description: "contract: accept the contract and move the card to plan." },
      { name: "--approve", description: "plan: approve the plan and move the card to build." },
      PROJECT_FLAG,
    ],
    example: 'polterware feature new "Ask before quitting the Desktop"',
  },
  {
    id: "verify",
    name: "polterware verify",
    synopsis: "polterware verify <slug|slug#T2> [--project <id>]",
    summary: "Report whether a card or one task is finished. Read-only; exits 1 when a check fails.",
    flags: [PROJECT_FLAG],
    example: "polterware verify my-card#T2",
  },
  {
    id: "inbox",
    name: "polterware inbox",
    synopsis:
      'polterware inbox [<id> decide "<answer>" | delegate | defer | fix-code | update-intent | ignore | verify | reject] [--agent <name>] [--project <id>]',
    summary: "List the Inbox, or apply one action to one item.",
    flags: [AGENT_FLAG, PROJECT_FLAG],
    example: "polterware inbox",
  },
  {
    id: "setup",
    name: "polterware setup",
    synopsis:
      "polterware setup [doctor] | claude [--uninstall | --enable | --disable | --skill-only] | codex [--uninstall] [--project <id>]",
    summary:
      "Install the Polterware plugin for Claude Code or the skill for Codex, or check the setup with doctor.",
    flags: [
      { name: "--uninstall", description: "claude: remove the plugin and local marketplace. codex: remove the skill file and the AGENTS.md line." },
      { name: "--enable", description: "claude: enable the installed plugin." },
      { name: "--disable", description: "claude: disable the installed plugin." },
      { name: "--skill-only", description: "claude: install the plugin with every hook switched off." },
      { name: "--project", value: "id", description: "codex: project id. Defaults to the project of the current directory." },
    ],
    example: "polterware setup claude",
  },
  {
    id: "hooks",
    name: "polterware hooks",
    synopsis: "polterware hooks [list] | enable|disable <status|stop|lint|session|all>",
    summary: "List the plugin hooks, or switch one on or off.",
    flags: [],
    example: "polterware hooks enable lint",
  },
  {
    id: "hook",
    name: "polterware hook",
    synopsis: "polterware hook session-start [--label <name>] | session-end | lint | status | stop",
    summary:
      "Claude Code hook entry points (JSON on stdin), installed by the Polterware plugin. session-start makes every apply in the session join one AgentRun per project; session-end completes it; lint checks written .pw.md files and returns errors to the agent; status prints the project status as session context; stop reminds the agent to write a handoff and never blocks.",
    flags: [
      {
        name: "--label",
        value: "name",
        description: "AgentRun label for the session. Defaults to claude-code.",
      },
    ],
    example: "polterware hook lint",
  },
  {
    id: "serve",
    name: "polterware serve",
    synopsis:
      "polterware [-db path] serve [--listen <addr>] [--token <token>] [--idle <duration>]",
    summary:
      "Run the local core server on a loopback address. The Desktop, the CLI, and the MCP bridge start it when none is running; run it directly for a standalone core. Exits 3 when another core holds the database lock.",
    flags: [
      {
        name: "--listen",
        value: "addr",
        description: "Loopback listen address. Defaults to 127.0.0.1:0 (a free port).",
      },
      {
        name: "--token",
        value: "token",
        description:
          "Session bearer token. Defaults to POLTERWARE_SESSION_TOKEN, or a freshly minted token.",
      },
      {
        name: "--idle",
        value: "duration",
        description:
          "Exit after this long without clients. Defaults to 0 (never exits); also POLTERWARE_CORE_IDLE.",
      },
    ],
    example: "polterware serve --idle 0",
  },
  {
    id: "mcp",
    name: "polterware mcp",
    synopsis: "polterware [-db path] mcp",
    summary:
      "Run the MCP server over stdio for coding agents. Tools are experimental and not a stable API contract.",
    flags: [],
    example: "polterware mcp",
  },
  {
    id: "help",
    name: "polterware help",
    synopsis: "polterware help",
    summary: "Print usage. Also available as -h and --help.",
    flags: [],
    example: "polterware help",
  },
];

export const CLI_TUI_KEYS: readonly CliKey[] = [
  { keys: "Tab / Shift+Tab", description: "Next or previous section." },
  { keys: "↑ ↓ / k j", description: "Move between sections." },
  { keys: "← → / h l", description: "Move within a section." },
  { keys: "Enter / Space", description: "Act on the selected row." },
  { keys: "s", description: "Start or stop the local core." },
  { keys: "i", description: "Register the current directory as a project." },
  { keys: "p", description: "Cycle the selected project." },
  { keys: "r", description: "Refresh status." },
  { keys: "q", description: "Quit." },
];

function flagTableMarkdown(flags: readonly CliFlag[], withRequired: boolean): string[] {
  const header = withRequired
    ? ["| Flag | Value | Required | Description |", "| --- | --- | --- | --- |"]
    : ["| Flag | Value | Description |", "| --- | --- | --- |"];
  const rows = flags.map((flag) => {
    const cells = [
      `\`${flag.name}\``,
      flag.value ? `\`<${flag.value}>\`` : "",
      ...(withRequired ? [flag.required ? "Yes" : ""] : []),
      flag.description,
    ];
    return `| ${cells.join(" | ")} |`;
  });
  return [...header, ...rows];
}

function commandIndexMarkdown(commands: readonly CliCommand[]): string[] {
  return [
    "| Command | Description |",
    "| --- | --- |",
    ...commands.map((command) => `| \`${command.name}\` | ${command.summary} |`),
  ];
}

function commandMarkdown(command: CliCommand): string[] {
  const lines = [`### ${command.name}`, "", command.summary, "", "```sh", command.synopsis, "```"];
  if (command.flags.length > 0) {
    lines.push("", "Options:", "", ...flagTableMarkdown(command.flags, true));
  }
  lines.push("", "Example:", "", "```sh", command.example, "```");
  return lines;
}

/** The whole reference as Markdown, for pasting into agents, docs, or issues. */
export function cliReferenceMarkdown(): string {
  const lines = [
    "# polterware CLI reference",
    "",
    "The polterware CLI reads and writes the same local database as the Desktop. init, scan, repo, export, and drift accept --json for scripts and agents.",
    "",
    "## Usage",
    "",
    "```sh",
    CLI_USAGE,
    "```",
    "",
    ...flagTableMarkdown(CLI_USAGE_FLAGS, false),
    "",
    "## Commands",
    "",
    ...commandIndexMarkdown(CLI_COMMANDS),
    "",
    ...CLI_COMMANDS.flatMap((command) => [...commandMarkdown(command), ""]),
    "## Interactive keys",
    "",
    "| Key | Action |",
    "| --- | --- |",
    ...CLI_TUI_KEYS.map((key) => `| \`${key.keys}\` | ${key.description} |`),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}
