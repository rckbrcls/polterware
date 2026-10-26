import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import {
  Button,
  Check,
  Copy,
  DataTable,
  IconSwap,
  Kbd,
  PageContent,
  PageToolbar,
  pushToast,
  ToolbarIconButton,
} from "@polterware/frontend-design-system";
import {
  CLI_COMMANDS,
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

// Mirrors ghostBody in backend/runtimes/cli/ghost.go; spaces are the eyes.
const GHOST_BODY = ["  ▄█████▄", " ████ █ ██", " ████▄█▄██", " █▀█▀█▀█▀█"].join("\n");

function CliMark() {
  return (
    <pre aria-hidden="true" class="m-0 mb-8 justify-self-center font-mono text-[12px] leading-none text-[var(--color-text-primary)]">
      <span class="text-[var(--color-success)]">{"     ●"}</span>
      {"\n"}
      <span class="text-[var(--color-text-muted)]">{"     │"}</span>
      {"\n"}
      {GHOST_BODY}
    </pre>
  );
}

function sectionId(command: CliCommand) {
  return `cli-${command.id}`;
}

type TocEntry = { id: string; label: string; nested?: boolean };

const FIRST_SECTION = "cli-usage";

const TOC: readonly TocEntry[] = [
  { id: FIRST_SECTION, label: "Usage" },
  { id: "cli-commands", label: "Commands" },
  ...CLI_COMMANDS.map((command) => ({ id: sectionId(command), label: command.name, nested: true })),
  { id: "cli-keys", label: "Interactive keys" },
];

// Offset from the scroller's top edge at which a section counts as current.
/** Height of the toolbar that floats over the scroll area. */
const TOOLBAR_OVERLAP = 48;
const ACTIVE_OFFSET = 32 + TOOLBAR_OVERLAP;
// Space kept above a section after navigating to it.
const SCROLL_MARGIN = 16 + TOOLBAR_OVERLAP;

function OnThisPage(props: { activeId: string; onNavigate: (id: string) => void }) {
  return (
    <nav aria-label="On this page" class="sticky top-14 hidden self-start lg:block">
      <ul class="m-0 grid list-none gap-0.5 p-0">
        <For each={TOC}>
          {(entry) => {
            const active = () => props.activeId === entry.id;
            return (
              <li>
                <a
                  href={`#${entry.id}`}
                  aria-current={active() ? "location" : undefined}
                  class="block truncate rounded-[var(--radius-item)] py-1 pr-2 text-[12.5px] no-underline outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]"
                  classList={{
                    "pl-2": !entry.nested,
                    "pl-5 font-mono text-[12px]": entry.nested,
                    "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]": active(),
                    "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]":
                      !active(),
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    props.onNavigate(entry.id);
                  }}
                >
                  {entry.label}
                </a>
              </li>
            );
          }}
        </For>
      </ul>
    </nav>
  );
}

export function CliReferencePage(props: { tabs?: JSX.Element }) {
  const [activeId, setActiveId] = createSignal(FIRST_SECTION);
  let layout: HTMLDivElement | undefined;

  // Scroll only PageContent; scrollIntoView would also scroll the shell and hide the toolbar.
  const scrollToSection = (id: string) => {
    setActiveId(id);
    const scroller = layout?.parentElement;
    const element = document.getElementById(id);
    if (!scroller || !element) return;
    const offset = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: scroller.scrollTop + offset - SCROLL_MARGIN, behavior: "smooth" });
  };

  onMount(() => {
    // PageContent is the scroll container.
    const scroller = layout?.parentElement;
    if (!scroller) return;

    const update = () => {
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        setActiveId(TOC.at(-1)?.id ?? FIRST_SECTION);
        return;
      }
      const top = scroller.getBoundingClientRect().top + ACTIVE_OFFSET;
      let current = FIRST_SECTION;
      for (const entry of TOC) {
        const element = document.getElementById(entry.id);
        if (element && element.getBoundingClientRect().top <= top) current = entry.id;
      }
      setActiveId(current);
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    });
  });

  return (
    <div class="relative flex h-full min-h-0 flex-col">
      {/* The toolbar floats over the scroll area so the page has no header band. */}
      <div class="pointer-events-none absolute inset-x-0 top-0 z-10 [&_button]:pointer-events-auto [&_[role=tablist]]:pointer-events-auto">
      <PageToolbar.Root>
        <Show
          when={props.tabs}
          fallback={
            <PageToolbar.Leading>
              <span class="pw-page-toolbar-title">CLI reference</span>
            </PageToolbar.Leading>
          }
        >
          <PageToolbar.Tabs>{props.tabs}</PageToolbar.Tabs>
        </Show>
        <PageToolbar.Actions>
          <ToolbarIconButton label="Copy reference" onClick={() => void copyText(cliReferenceMarkdown(), "Reference")}>
            <Copy size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>
      </div>
      <PageContent class="pw-scroll-fade overflow-auto px-4 pb-8 pt-[72px]">
        <div
          ref={layout}
          class="grid w-full gap-10 lg:grid-cols-[180px_minmax(0,1fr)]"
        >
          <OnThisPage activeId={activeId()} onNavigate={scrollToSection} />

          <div class="mx-auto grid w-full min-w-0 max-w-3xl gap-12">
            <CliMark />

            <section id={FIRST_SECTION} class="grid gap-4">
              <SectionHeading>Usage</SectionHeading>
              <Prose>
                The polterware CLI reads and writes the same local database as the Desktop. init, scan,
                context, and drift accept --json for scripts and agents.
              </Prose>
              <CodeBlock command={CLI_USAGE} prompt={false} />
              <FlagTable label="Usage options" flags={CLI_USAGE_FLAGS} />
            </section>

            <section id="cli-commands" class="grid gap-4">
              <SectionHeading>Commands</SectionHeading>
              <CommandIndex
                label="polterware commands"
                commands={CLI_COMMANDS}
                onNavigate={scrollToSection}
              />
            </section>

            <For each={CLI_COMMANDS}>{(command) => <CommandSection command={command} />}</For>

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

          </div>
        </div>
      </PageContent>
    </div>
  );
}
