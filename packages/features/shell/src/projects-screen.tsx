import { For, Show, createMemo, createSignal } from "solid-js";
import {
  ActiveFilterBar,
  Badge,
  Button,
  Card,
  ContextMenu,
  Copy,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExternalLink,
  Folder,
  FolderKanban,
  FilterPopover,
  IconTile,
  MoreHorizontal,
  PageContent,
  PageEmpty,
  TemplateCardGrid,
  PageLoading,
  PageOffline,
  Plus,
  SearchBar,
  Settings,
  StatusDot,
  ToolbarIconButton,
  buttonClassName,
  matchClauses,
  type FilterField,
  type StatusTone,
} from "@polterware/frontend-design-system";
import { createPageFilters } from "./page-filters";
import type { ProjectSwitcherItem } from "./types";
import "./projects-screen.css";

export type ProjectsScreenProps = {
  projects: readonly ProjectSwitcherItem[];
  /** True until the first project catalog read finishes. */
  loading?: boolean;
  /** True when the local core could not be read. */
  unavailable?: boolean;
  message?: string;
  onOpenProject: (projectId: string) => void;
  onOpenProjectSettings?: (projectId: string) => void;
  onCreateProject: () => void;
};

function secondaryLine(project: ProjectSwitcherItem): { text: string; title?: string } | undefined {
  const description = project.description?.trim();
  if (description) return { text: description };
  const path = project.directory?.trim();
  if (path) return { text: path, title: path };
  return undefined;
}

/** Last path segment, shown as the folder badge. */
function folderName(project: ProjectSwitcherItem): string | undefined {
  const path = project.directory?.trim().replace(/[\\/]+$/, "");
  if (!path) return undefined;
  return path.split(/[\\/]/).pop() || undefined;
}

type ProjectStatus = NonNullable<ProjectSwitcherItem["status"]>;
type FolderFilter = "linked" | "none";

const STATUS_FILTERS: { id: ProjectStatus; label: string; tone: StatusTone }[] = [
  { id: "active", label: "Active", tone: "ok" },
  { id: "paused", label: "Paused", tone: "warn" },
  { id: "archived", label: "Archived", tone: "muted" },
];

const FOLDER_FILTERS: { id: FolderFilter; label: string }[] = [
  { id: "linked", label: "Linked folder" },
  { id: "none", label: "No folder" },
];

/** A project without a stored status is treated as active. */
function statusOf(project: ProjectSwitcherItem): ProjectStatus {
  return project.status ?? "active";
}

function folderOf(project: ProjectSwitcherItem): FolderFilter {
  return project.directory?.trim() ? "linked" : "none";
}

type CardMenu = { project: ProjectSwitcherItem; x: number; y: number };

function ProjectCard(props: {
  project: ProjectSwitcherItem;
  onOpen: (projectId: string) => void;
  onOpenSettings?: (projectId: string) => void;
  onMenu: (menu: CardMenu) => void;
}) {
  const secondary = () => secondaryLine(props.project);

  function activate() {
    props.onOpen(props.project.projectId);
  }

  return (
    <Card
      class="pw-projects-card"
      ref={(element) => {
        element.tabIndex = 0;
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", `Open ${props.project.name}`);
        // The menu trigger lives inside the card; stopping propagation would also starve Ark's delegated handlers.
        const inMenu = (event: Event) => event.target instanceof Element && event.target.closest(".pw-projects-card-menu") !== null;
        element.onclick = (event) => {
          if (!inMenu(event)) activate();
        };
        element.oncontextmenu = (event) => {
          event.preventDefault();
          props.onMenu({ project: props.project, x: event.clientX, y: event.clientY });
        };
        element.onkeydown = (event) => {
          if (inMenu(event)) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activate();
        };
      }}
    >
      <div class="pw-projects-card-head">
        <IconTile size={24} seed={props.project.projectId} class="shrink-0">
          <FolderKanban size={14} />
        </IconTile>
        <h2 class="truncate text-[14px] font-medium text-[var(--color-text-primary)]">
          {props.project.name}
        </h2>
        <span class="pw-projects-card-menu">
          <DropdownMenu positioning={{ placement: "bottom-end" }}>
            <DropdownMenuTrigger aria-label={`Actions for ${props.project.name}`} class={buttonClassName("texture", "icon")}>
              <MoreHorizontal size={14} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-40">
              <DropdownMenuItem value="open" onSelect={activate}>
                <ExternalLink size={14} aria-hidden="true" />
                Open
              </DropdownMenuItem>
              <Show when={props.onOpenSettings}>
                <DropdownMenuItem value="settings" onSelect={() => props.onOpenSettings?.(props.project.projectId)}>
                  <Settings size={14} aria-hidden="true" />
                  Project settings
                </DropdownMenuItem>
              </Show>
              <Show when={props.project.directory?.trim()}>
                <DropdownMenuItem
                  value="copy-path"
                  onSelect={() => {
                    const path = props.project.directory?.trim();
                    if (path) void navigator.clipboard?.writeText(path);
                  }}
                >
                  <Copy size={14} aria-hidden="true" />
                  Copy path
                </DropdownMenuItem>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      <Show when={secondary()}>
        {(line) => (
          <p class="pw-projects-card-description" title={line().title}>
            {line().text}
          </p>
        )}
      </Show>
      <div class="pw-projects-card-meta">
        <Badge tone="muted">{props.project.environmentSummary}</Badge>
        <Show when={folderName(props.project)}>
          {(name) => (
            <Badge tone="muted" class="pw-projects-card-folder" title={props.project.directory}>
              <Folder size={12} aria-hidden="true" />
              {name()}
            </Badge>
          )}
        </Show>
      </div>
    </Card>
  );
}

export function ProjectsScreen(props: ProjectsScreenProps) {
  const [query, setQuery] = createSignal("");
  const [menu, setMenu] = createSignal<CardMenu | null>(null);
  const countOf = (match: (project: ProjectSwitcherItem) => boolean) => props.projects.filter(match).length;
  const fields = (): FilterField[] => [
    {
      id: "status",
      label: "Status",
      pluralLabel: "statuses",
      kind: "multi",
      icon: () => <StatusDot tone="ok" showLabel={false} />,
      options: STATUS_FILTERS.map((option) => ({
        id: option.id,
        label: option.label,
        trailing: String(countOf((project) => statusOf(project) === option.id)),
        icon: () => <StatusDot tone={option.tone} showLabel={false} />,
      })),
    },
    {
      id: "folder",
      label: "Folder",
      kind: "multi",
      icon: () => <Folder size={14} aria-hidden />,
      options: FOLDER_FILTERS.map((option) => ({
        id: option.id,
        label: option.label,
        trailing: String(countOf((project) => folderOf(project) === option.id)),
        icon: () => <Folder size={14} aria-hidden />,
      })),
    },
  ];
  const filters = createPageFilters({ surface: "projects", appLevel: true, fields });
  const filtered = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    return props.projects.filter(
      (project) =>
        (!normalized || project.name.toLowerCase().includes(normalized)) &&
        matchClauses(project, filters.pageClauses(), { status: statusOf, folder: folderOf }),
    );
  });

  return (
    <div class="pw-projects">
      <div class="pw-projects-column">
        <div class="pw-projects-bar">
          <h1 class="pw-page-toolbar-title m-0">Projects</h1>
          <div class="pw-projects-bar-actions">
            <SearchBar
              placeholder="Search projects"
              aria-label="Search projects by name"
              value={query()}
              onInput={setQuery}
            />
            <FilterPopover
              ariaLabel="Project filters"
              title="Filter projects"
              shortcut
              fields={filters.fields()}
              clauses={filters.clauses()}
              onClausesChange={filters.onClausesChange}
              saved={filters.saved()}
            />
            <ToolbarIconButton label="New project" onClick={() => props.onCreateProject()}>
              <Plus size={14} />
            </ToolbarIconButton>
          </div>
        </div>
        <ActiveFilterBar
          fields={filters.fields()}
          clauses={filters.clauses()}
          onClausesChange={filters.onClausesChange}
          saved={filters.saved()}
        />
      </div>
      <PageContent class="pw-scroll-fade">
        <Show
          when={!props.loading}
          fallback={<PageLoading layout="page" label="Loading projects…" />}
        >
          <Show
            when={!props.unavailable}
            fallback={<PageOffline message={props.message || undefined} />}
          >
            <Show
              when={filtered().length > 0}
              fallback={
                <Show
                  when={props.projects.length === 0}
                  fallback={
                    <PageEmpty
                      title="No matches"
                      mood="lost"
                    />
                  }
                >
                  <PageEmpty
                    title="No projects yet"
                    mood="sleeping"
                  >
                    <TemplateCardGrid
                      items={[
                        {
                          id: "local-project",
                          title: "Local project",
                          description: "A workspace on this machine.",
                          icon: <FolderKanban size={16} />,
                          onSelect: () => props.onCreateProject(),
                        },
                      ]}
                    />
                  </PageEmpty>
                </Show>
              }
            >
              <ul class="pw-projects-grid" aria-label="Projects">
                <For each={filtered()}>
                  {(project) => (
                    <li>
                      <ProjectCard project={project} onOpen={props.onOpenProject} onOpenSettings={props.onOpenProjectSettings} onMenu={setMenu} />
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </PageContent>
      <ContextMenu.Root
        open={menu() !== null}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
        anchorPoint={menu()}
      >
        <ContextMenu.Content>
          <ContextMenu.Item
            value="open"
            onSelect={() => {
              const project = menu()?.project;
              if (project) props.onOpenProject(project.projectId);
            }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open
          </ContextMenu.Item>
          <Show when={props.onOpenProjectSettings}>
            <ContextMenu.Item
              value="settings"
              onSelect={() => {
                const project = menu()?.project;
                if (project) props.onOpenProjectSettings?.(project.projectId);
              }}
            >
              <Settings size={14} aria-hidden="true" />
              Project settings
            </ContextMenu.Item>
          </Show>
          <Show when={menu()?.project.directory?.trim()}>
            <ContextMenu.Item
              value="copy-path"
              onSelect={() => {
                const path = menu()?.project.directory?.trim();
                if (path) void navigator.clipboard?.writeText(path);
              }}
            >
              <Copy size={14} aria-hidden="true" />
              Copy path
            </ContextMenu.Item>
          </Show>
        </ContextMenu.Content>
      </ContextMenu.Root>
    </div>
  );
}
