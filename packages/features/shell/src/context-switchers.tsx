import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { Box, Button, Folder, IconTile, Layers, Plus, Settings } from "@polterware/frontend-design-system";
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
import "./context-switchers.css";

export type WorkspaceContext = {
  projectId: string;
  environmentId: string;
};

type MenuId = "project" | "env" | "scope" | null;

export const WHOLE_PROJECT_SCOPE: WorkspaceScope = { node: "" };

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
  onOpenProjectSettings?: () => void;
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
  const filteredProjects = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    if (!normalized) return projects();
    return projects().filter((project) => project.name.toLowerCase().includes(normalized));
  });
  const scope = () => props.scope ?? WHOLE_PROJECT_SCOPE;
  const scopeNodes = () => props.scopeNodes ?? [];
  const currentScopeNode = createMemo(() => scopeNodes().find((node) => node.path === scope().node));
  const filteredDomains = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    const domains = scopeNodes().filter((node) => node.level === "domain");
    if (!normalized) return domains;
    return domains.filter(
      (node) =>
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
      <div class="pw-project-crumb relative flex min-w-0 items-center">
        <SwitcherTrigger
          ref={(element) => {
            projectTrigger = element;
          }}
          class="!max-w-[220px] !gap-3 !pl-1.5 !pr-2"
          aria-label={`Switch project: ${currentProject()?.name ?? "Project"}`}
          aria-expanded={openMenu() === "project"}
          onClick={() => setOpenMenu((current) => (current === "project" ? null : "project"))}
        >
          <IconTile size={20} tone="architecture" seed={currentProject()?.projectId ?? "project"} class="shrink-0">
            <Folder size={12} />
          </IconTile>
          <span class="truncate">{currentProject()?.name ?? "Project"}</span>
        </SwitcherTrigger>
        <div class="pw-project-crumb-settings pw-fade-inline-start">
          <Button
            variant="icon"
            size="icon"
            aria-label="Project settings"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenProjectSettings?.();
            }}
          >
            <Settings size={14} />
          </Button>
        </div>
      </div>

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
          aria-label={`Filter by scope: ${currentScopeNode()?.title ?? "All"}`}
          aria-expanded={openMenu() === "scope"}
          onClick={() => setOpenMenu((current) => (current === "scope" ? null : "scope"))}
        >
          <span class="truncate">{currentScopeNode()?.title ?? "All"}</span>
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
          placeholder="Find domain…"
          value={query()}
          onInput={setQuery}
          autofocus
        />
        <MenuList class="min-h-0 flex-1 overflow-auto p-2">
          <MenuItem
            class="gap-2 py-2 text-[13.5px]"
            selected={scope().node === ""}
            onClick={() => {
              props.onSelectScope?.(WHOLE_PROJECT_SCOPE);
              closeAfterAcknowledge();
            }}
          >
            <IconTile size={20} tone="neutral" seed="scope-all">
              <Layers size={12} />
            </IconTile>
            <span class="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">All</span>
            <SelectionCheck checked={scope().node === ""} size={15} />
          </MenuItem>
          <For each={filteredDomains()}>
            {(node) => (
              <MenuItem
                class="gap-2 py-2 text-[13.5px]"
                selected={node.path === scope().node}
                onClick={() => {
                  props.onSelectScope?.({ node: node.path });
                  closeAfterAcknowledge();
                }}
              >
                <IconTile size={20} tone="architecture" seed={node.id}>
                  <Box size={12} />
                </IconTile>
                <span class="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">
                  {node.title}
                </span>
                <SelectionCheck checked={node.path === scope().node} size={15} />
              </MenuItem>
            )}
          </For>
        </MenuList>
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
                class="gap-2 py-2 text-[13.5px]"
                selected={project.projectId === props.context.projectId}
                onClick={() => {
                  props.onSelectProject?.(project.projectId);
                  closeAfterAcknowledge();
                }}
              >
                <IconTile size={20} tone="architecture" seed={project.projectId}>
                  <Folder size={12} />
                </IconTile>
                <span class="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">{project.name}</span>
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
