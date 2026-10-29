import { For, Show, createSignal, onCleanup, type JSX } from "solid-js";
import {
  Button,
  Check,
  Copy,
  DataTable,
  IconSwap,
  Kbd,
  pushToast,
} from "@polterware/frontend-design-system";
import {
  CLI_COMMANDS,
  CLI_COMMAND_GROUPS,
  CLI_USAGE_FLAGS,
  CLI_TUI_KEYS,
  CLI_USAGE,
  cliReferenceMarkdown,
  type CliCommand,
  type CliFlag,
  type CliKey,
} from "./cli-reference";

async function copyText(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    pushToast(`${what} copied.`, "success");
    return true;
  } catch {
    pushToast(`Could not copy ${what.toLowerCase()}.`, "danger");
    return false;
  }
}

/** How long a copy button shows its check before returning to the copy glyph. */
const COPIED_HOLD_MS = 1500;

function SectionHeading(props: { children: string }) {
  return (
    <h2 class="m-0 font-mono pw-selectable text-[15px] font-medium text-[var(--color-text-primary)]">
      {props.children}
    </h2>
  );
}

function GroupHeading(props: { children: string }) {
  return (
    <h3 class="m-0 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
      {props.children}
    </h3>
  );
}

function Prose(props: { children: JSX.Element }) {
  return (
    <p class="m-0 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
      {props.children}
    </p>
  );
}

function CodeBlock(props: { command: string; prompt?: boolean }) {
  const [copied, setCopied] = createSignal(false);
  let resetTimer: number | undefined;
  onCleanup(() => window.clearTimeout(resetTimer));
  const copy = async () => {
    if (!(await copyText(props.command, "Command"))) return;
    window.clearTimeout(resetTimer);
    setCopied(true);
    resetTimer = window.setTimeout(() => setCopied(false), COPIED_HOLD_MS);
  };
  return (
    <div class="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] py-1 pl-3 pr-1">
      <code class="min-w-0 break-words font-mono pw-selectable text-[12px] text-[var(--color-text-primary)]">
        {props.prompt === false ? "" : "$ "}
        {props.command}
      </code>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Copy ${props.command}`}
        onClick={() => void copy()}
      >
        <IconSwap swapped={copied()} from={<Copy size={14} />} to={<Check size={14} />} />
        Copy
      </Button>
    </div>
  );
}

type ReferenceColumn<T> = {
  id: string;
  label: string;
  width?: string;
  cell: (row: T) => JSX.Element;
};

function ReferenceTable<T>(props: {
  label: string;
  rows: readonly T[];
  rowId: (row: T) => string;
  columns: readonly ReferenceColumn<T>[];
}) {
  return (
    <DataTable.Root
      rows={props.rows}
      getRowId={(row) => props.rowId(row)}
      gutters={false}
      resizableColumns={false}
      class="flex-none"
    >
      <DataTable.Table aria-label={props.label} class="min-w-0!">
        <DataTable.Header>
          <For each={props.columns}>
            {(column) => (
              <DataTable.ColumnHeader id={column.id} sortable={false} width={column.width}>
                {column.label}
              </DataTable.ColumnHeader>
            )}
          </For>
        </DataTable.Header>
        <DataTable.Body>
          {(row: T) => (
            <DataTable.Row row={row} rowId={props.rowId(row)}>
              <For each={props.columns}>
                {(column) => <DataTable.Cell>{column.cell(row)}</DataTable.Cell>}
              </For>
            </DataTable.Row>
          )}
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  );
}

const monoCell = "font-mono pw-selectable whitespace-nowrap text-[12px] text-[var(--color-text-primary)]";
const textCell = "text-[12.5px] leading-relaxed";

function FlagTable(props: { label: string; flags: readonly CliFlag[]; showRequired?: boolean }) {
  const columns: ReferenceColumn<CliFlag>[] = [
    { id: "flag", label: "Flag", width: "22%", cell: (flag) => <span class={monoCell}>{flag.name}</span> },
    {
      id: "value",
      label: "Value",
      width: "14%",
      cell: (flag) => (
        <span class="font-mono whitespace-nowrap text-[12px] text-[var(--color-text-muted)]">
          {flag.value ? `<${flag.value}>` : ""}
        </span>
      ),
    },
    ...(props.showRequired
      ? [
          {
            id: "required",
            label: "Required",
            width: "12%",
            cell: (flag: CliFlag) => (
              <span class="text-[12px] text-[var(--color-text-primary)]">
                {flag.required ? "Yes" : ""}
              </span>
            ),
          },
        ]
      : []),
    { id: "description", label: "Description", cell: (flag) => <span class={textCell}>{flag.description}</span> },
  ];
  return (
    <ReferenceTable label={props.label} rows={props.flags} rowId={(flag) => flag.name} columns={columns} />
  );
}

function CommandSection(props: { command: CliCommand }) {
  return (
    <section id={sectionId(props.command)} class="grid gap-4">
      <SectionHeading>{props.command.name}</SectionHeading>
      <Prose>{props.command.summary}</Prose>
      <div class="grid gap-2">
        <GroupHeading>Usage</GroupHeading>
        <CodeBlock command={props.command.synopsis} prompt={false} />
      </div>
      <Show when={props.command.flags.length > 0}>
        <div class="grid gap-2">
          <GroupHeading>Options</GroupHeading>
          <FlagTable label={`${props.command.name} options`} flags={props.command.flags} showRequired />
        </div>
      </Show>
      <div class="grid gap-2">
        <GroupHeading>Example</GroupHeading>
        <CodeBlock command={props.command.example} />
      </div>
    </section>
  );
}

function CommandIndex(props: {
  label: string;
  commands: readonly CliCommand[];
  onNavigate: (id: string) => void;
}) {
  return (
    <ReferenceTable
      label={props.label}
      rows={props.commands}
      rowId={(command) => command.id}
      columns={[
        {
          id: "command",
          label: "Command",
          width: "32%",
          cell: (command) => (
            <a
              href={`#${sectionId(command)}`}
              class={`${monoCell} no-underline hover:underline`}
              onClick={(event) => {
                event.preventDefault();
                props.onNavigate(sectionId(command));
              }}
            >
              {command.name}
            </a>
          ),
        },
        { id: "description", label: "Description", cell: (command) => <span class={textCell}>{command.summary}</span> },
      ]}
    />
  );
}

function sectionId(command: CliCommand) {
  return `cli-command-${command.id}`;
}

const FIRST_SECTION = "cli-usage";

/** Commands of each group, in group order. */
const GROUPED_COMMANDS = CLI_COMMAND_GROUPS.map((group) => ({
  ...group,
  anchor: `cli-group-${group.id}`,
  items: group.commands.flatMap((id) => CLI_COMMANDS.filter((command) => command.id === id)),
}));

/** The reference itself: usage, the grouped command index, interactive keys, and one section per command. */
function CliReferenceSections(props: { onNavigate: (id: string) => void }) {
  return (
    <>
      <section id={FIRST_SECTION} class="grid gap-4">
        <SectionHeading>Usage</SectionHeading>
        <Prose>
          The polterware CLI reads and writes the same local database as the Desktop, through the local core.
          Commands that list --json in their options print JSON for scripts and agents.
        </Prose>
        <CodeBlock command={CLI_USAGE} prompt={false} />
        <FlagTable label="Usage options" flags={CLI_USAGE_FLAGS} />
      </section>

      <section id="cli-commands" class="grid gap-6">
        <SectionHeading>All commands</SectionHeading>
        <For each={GROUPED_COMMANDS}>
          {(group) => (
            <div class="grid gap-2">
              <GroupHeading>{group.label}</GroupHeading>
              <CommandIndex label={`${group.label} commands`} commands={group.items} onNavigate={props.onNavigate} />
            </div>
          )}
        </For>
      </section>

      <section id="cli-keys" class="grid gap-4">
        <SectionHeading>Interactive keys</SectionHeading>
        <Prose>Keys available in the interactive status view started by running polterware with no command.</Prose>
        <ReferenceTable<CliKey>
          label="Interactive keys"
          rows={CLI_TUI_KEYS}
          rowId={(key) => key.keys}
          columns={[
            {
              id: "keys",
              label: "Key",
              width: "32%",
              cell: (key) => <Kbd>{key.keys}</Kbd>,
            },
            { id: "action", label: "Action", cell: (key) => <span class={textCell}>{key.description}</span> },
          ]}
        />
      </section>

      <For each={GROUPED_COMMANDS}>
        {(group) => (
          <div class="grid gap-12">
            <h2
              id={group.anchor}
              class="m-0 border-b border-[var(--color-border)] pb-2 text-[12px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              {group.label}
            </h2>
            <For each={group.items}>{(command) => <CommandSection command={command} />}</For>
          </div>
        )}
      </For>
    </>
  );
}

const copyReference = () => void copyText(cliReferenceMarkdown(), "Reference");

/** The CLI reference as an App settings page: the settings rail is the navigation, so it has no sidebar of its own. */
export function CliReferenceSettings() {
  return (
    <div class="grid min-w-0 gap-12">
      <div class="flex items-center justify-between gap-3">
        <p class="m-0 text-[12.5px] text-[var(--color-text-muted)]">Every polterware command, its options, and the interactive keys.</p>
        {/* Labelled rather than icon-only: it copies the whole reference as Markdown, which an icon alone does not say. */}
        <Button variant="primary" size="sm" class="!rounded-full shrink-0" onClick={copyReference}>
          <Copy size={14} aria-hidden />
          Copy full reference
        </Button>
      </div>
      <CliReferenceSections
        onNavigate={(id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />
    </div>
  );
}
