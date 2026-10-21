import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { Plus } from "@polterware/frontend-design-system";
import {
  MenuItem,
  MenuList,
  Popover,
  SELECTION_ACK_MS,
  SelectionCheck,
  StatusChip,
  SwitcherTrigger,
} from "@polterware/frontend-design-system";
import type {
  EnvironmentItem,
  EnvironmentKind,
  ProjectSwitcherItem,
  ScopeNodeItem,
  WorkspaceScope,
} from "./types";
import { ENVIRONMENT_FIXTURES, PROJECT_SWITCHER_FIXTURES } from "./fixtures";
import { PopoverSearchField } from "@polterware/frontend-shell";

export type WorkspaceContext = {
  projectId: string;
  environmentId: string;
};

type MenuId = "project" | "env" | "scope" | null;

export const WHOLE_PROJECT_SCOPE: WorkspaceScope = { node: "", exact: false };

/** Atlas nodes in tree order (parents before children), with their depth. */
function scopeTree(nodes: ScopeNodeItem[]): { node: ScopeNodeItem; depth: number }[] {
  const children = new Map<string, ScopeNodeItem[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const key = ids.has(node.parentId) ? node.parentId : "";
    children.set(key, [...(children.get(key) ?? []), node]);
  }
  const out: { node: ScopeNodeItem; depth: number }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const node of children.get(parent) ?? []) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

function kindLabel(kind: EnvironmentKind): string {
  return kind.toUpperCase();
}

function kindTone(kind: EnvironmentKind): "warn" | "syncing" | "muted" {
  if (kind === "production") return "warn";
  if (kind === "staging") return "syncing";
  return "muted";
}

export function WorkspaceContextBar(props: {
  context: WorkspaceContext;
  projects?: ProjectSwitcherItem[];
  environments?: EnvironmentItem[];
  onSelectProject?: (projectId: string) => void;
  onSelectEnvironment?: (environmentId: string) => void;
  onCreateProject?: () => void;
  scopeNodes?: ScopeNodeItem[];
  scope?: WorkspaceScope;
  onSelectScope?: (scope: WorkspaceScope) => void;
}) {
  const [openMenu, setOpenMenu] = createSignal<MenuId>(null);
  const [query, setQuery] = createSignal("");
  let projectTrigger: HTMLButtonElement | undefined;
  let environmentTrigger: HTMLButtonElement | undefined;
  let scopeTrigger: HTMLButtonElement | undefined;

  const projects = () => props.projects ?? PROJECT_SWITCHER_FIXTURES;
  const environments = () => props.environments ?? ENVIRONMENT_FIXTURES;
  const currentProject = createMemo(
    () => projects().find((project) => project.projectId === props.context.projectId) ?? projects()[0],
  );
  const currentEnvironment = createMemo(
    () =>
      environments().find((environment) => environment.id === props.context.environmentId) ??
      environments().find((environment) => environment.projectId === props.context.projectId) ??
      environments()[0],
  );
  const filteredProjects = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    if (!normalized) return projects();
    return projects().filter((project) => project.name.toLowerCase().includes(normalized));
  });
  // A pick holds the popover open briefly so the marker glide and check are seen.
  let acknowledgeTimer: ReturnType<typeof setTimeout> | undefined;
  const clearAcknowledge = () => {
    if (acknowledgeTimer !== undefined) clearTimeout(acknowledgeTimer);
    acknowledgeTimer = undefined;
  };
  onCleanup(clearAcknowledge);
  const closeAfterAcknowledge = () => {
    clearAcknowledge();
    acknowledgeTimer = setTimeout(() => {
      acknowledgeTimer = undefined;
      close();
    }, SELECTION_ACK_MS);
  };
  const scope = () => props.scope ?? WHOLE_PROJECT_SCOPE;
  const scopeNodes = () => props.scopeNodes ?? [];
  const currentScopeNode = createMemo(() => scopeNodes().find((node) => node.path === scope().node));
  const filteredScopeTree = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    const tree = scopeTree(scopeNodes());
    if (!normalized) return tree;
    return tree.filter(
      ({ node }) =>
        node.title.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized),
    );
  });
  const projectEnvironments = createMemo(() =>
    environments().filter((environment) => environment.projectId === props.context.projectId),
  );

  function close() {
    clearAcknowledge();
    setOpenMenu(null);
    setQuery("");
  }

  return (
    <div class="flex min-w-0 items-center gap-1">
      <SwitcherTrigger
        ref={(element) => {
          projectTrigger = element;
        }}
        aria-label={`Switch project: ${currentProject()?.name ?? "Project"}`}
        aria-expanded={openMenu() === "project"}
        onClick={() => setOpenMenu((current) => (current === "project" ? null : "project"))}
      >
        <span class="truncate">{currentProject()?.name ?? "Project"}</span>
      </SwitcherTrigger>

      <span class="text-[11px] text-[var(--color-text-disabled)]" aria-hidden>
        /
      </span>

      <SwitcherTrigger
        ref={(element) => {
          environmentTrigger = element;
        }}
        aria-label={`Switch environment: ${currentEnvironment()?.name ?? "Environment"}`}
        aria-expanded={openMenu() === "env"}
        onClick={() => setOpenMenu((current) => (current === "env" ? null : "env"))}
      >
        <Show when={currentEnvironment()}>
          {(environment) => (
            <StatusChip
              appearance="filled"
              tone={kindTone(environment().kind)}
              label={kindLabel(environment().kind)}
            />
          )}
        </Show>
      </SwitcherTrigger>

      <Show when={scopeNodes().length > 0}>
        <span class="text-[11px] text-[var(--color-text-disabled)]" aria-hidden>
          /
        </span>

        <SwitcherTrigger
          ref={(element) => {
            scopeTrigger = element;
          }}
          aria-label={`Filter by scope: ${currentScopeNode()?.title ?? "Whole project"}`}
          aria-expanded={openMenu() === "scope"}
          onClick={() => setOpenMenu((current) => (current === "scope" ? null : "scope"))}
        >
          <span class="truncate">{currentScopeNode()?.title ?? "Whole project"}</span>
          <Show when={currentScopeNode() && scope().exact}>
            <StatusChip appearance="filled" tone="muted" label="EXACT" />
          </Show>
        </SwitcherTrigger>
      </Show>

      <Popover
        open={openMenu() === "scope"}
        onClose={close}
        title="Filter by scope"
        width={320}
        placement="bottom-start"
        anchorRef={() => scopeTrigger}
      >
        <PopoverSearchField
          placeholder="Find component, domain, system…"
          value={query()}
          onInput={setQuery}
          autofocus
        />
        <MenuList class="min-h-0 flex-1 overflow-auto p-2">
          <MenuItem
            class="justify-between py-2 text-[13.5px]"
            selected={scope().node === ""}
            onClick={() => {
              props.onSelectScope?.(WHOLE_PROJECT_SCOPE);
              closeAfterAcknowledge();
            }}
          >
            <span class="truncate text-[var(--color-text-primary)]">Whole project</span>
            <SelectionCheck checked={scope().node === ""} size={15} />
          </MenuItem>
          <For each={filteredScopeTree()}>
            {(entry) => (
              <MenuItem
                class="justify-between py-2 text-[13.5px]"
                selected={entry.node.path === scope().node}
                onClick={() => {
                  props.onSelectScope?.({ node: entry.node.path, exact: scope().exact });
                  closeAfterAcknowledge();
                }}
              >
                <span
                  class="min-w-0 flex-1 truncate text-[var(--color-text-primary)]"
                  style={{ "padding-left": `${entry.depth * 12}px` }}
                >
                  {entry.node.title}
                </span>
                <span class="shrink-0 text-[11px] text-[var(--color-text-muted)]">{entry.node.level}</span>
                <SelectionCheck checked={entry.node.path === scope().node} size={15} />
              </MenuItem>
            )}
          </For>
        </MenuList>
        <Show when={scope().node !== ""}>
          <div class="border-t border-[var(--color-border-subtle)] p-2">
            <MenuItem
              class="justify-between py-2 text-[13px]"
              selected={scope().exact}
              onClick={() => props.onSelectScope?.({ node: scope().node, exact: !scope().exact })}
            >
              <span>Exact: leave out ancestors</span>
              <SelectionCheck checked={scope().exact} size={15} />
            </MenuItem>
          </div>
        </Show>
      </Popover>

      <Popover
        open={openMenu() === "project"}
        onClose={close}
        title="Switch project"
        width={300}
        placement="bottom-start"
        anchorRef={() => projectTrigger}
      >
        <PopoverSearchField
          placeholder="Find project…"
          value={query()}
          onInput={setQuery}
          autofocus
        />
        <MenuList class="min-h-0 flex-1 overflow-auto p-2">
          <For each={filteredProjects()}>
            {(project) => (
              <MenuItem
                class="justify-between py-2 text-[13.5px]"
                selected={project.projectId === props.context.projectId}
                onClick={() => {
                  props.onSelectProject?.(project.projectId);
                  closeAfterAcknowledge();
                }}
              >
                <span class="truncate text-[var(--color-text-primary)]">{project.name}</span>
                <SelectionCheck checked={project.projectId === props.context.projectId} size={15} />
              </MenuItem>
            )}
          </For>
        </MenuList>
        <div class="border-t border-[var(--color-border-subtle)] p-2">
          <MenuItem
            class="gap-2 py-2 text-[13px]"
            onClick={() => {
              props.onCreateProject?.();
              close();
            }}
          >
            <Plus size={14} />
            New project
          </MenuItem>
        </div>
      </Popover>

      <Popover
        open={openMenu() === "env"}
        onClose={close}
        title="Switch environment"
        width={300}
        placement="bottom-start"
        anchorRef={() => environmentTrigger}
      >
        <MenuList class="min-h-0 flex-1 overflow-auto p-2">
          <For each={projectEnvironments()}>
            {(environment) => (
              <MenuItem
                class="justify-between py-2 text-[13.5px]"
                selected={environment.id === props.context.environmentId}
                onClick={() => {
                  props.onSelectEnvironment?.(environment.id);
                  closeAfterAcknowledge();
                }}
              >
                <StatusChip
                  appearance="filled"
                  tone={kindTone(environment.kind)}
                  label={kindLabel(environment.kind)}
                />
                <span class="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">
                  {environment.name}
                </span>
                <SelectionCheck checked={environment.id === props.context.environmentId} />
              </MenuItem>
            )}
          </For>
        </MenuList>
      </Popover>
    </div>
  );
}
