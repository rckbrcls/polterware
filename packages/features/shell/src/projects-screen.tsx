import { Show, createMemo, createSignal } from "solid-js";
import {
  ActiveFilterBar,
  ContextMenu,
  Copy,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExternalLink,
  FilterChip,
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
  Tooltip,
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

/** Last path segment, shown in the Folder column. */
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

function statusOption(project: ProjectSwitcherItem) {
  const status = statusOf(project);
  return STATUS_FILTERS.find((option) => option.id === status)!;
}

function folderOf(project: ProjectSwitcherItem): FolderFilter {
  return project.directory?.trim() ? "linked" : "none";
}

/** `lastActivity` is already formatted; sort by the instant it names when it parses. */
function updatedAt(project: ProjectSwitcherItem): number | undefined {
  const time = Date.parse(project.lastActivity ?? "");
  return Number.isNaN(time) ? undefined : time;
}

type RowMenu = { project: ProjectSwitcherItem; x: number; y: number };

function ProjectRow(props: {
  project: ProjectSwitcherItem;
  onOpen: (projectId: string) => void;
  onOpenSettings?: (projectId: string) => void;
  onMenu: (menu: RowMenu) => void;
}) {
  const project = () => props.project;
  const activate = () => props.onOpen(project().projectId);

  return (
    <DataTable.Row
      row={project()}
      rowId={project().projectId}
      aria-label={`Open ${project().name}`}
      onActivate={activate}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onMenu({ project: project(), x: event.clientX, y: event.clientY });
      }}
    >
      <DataTable.PrimaryCell
        class="pw-projects-name-cell"
        leading={
          <IconTile size={16} seed={project().projectId}>
            <FolderKanban size={11} />
          </IconTile>
        }
        title={
          <>
            {project().name}
            <Show when={project().description?.trim()}>
              {(description) => <span class="pw-projects-description">{description()}</span>}
            </Show>
          </>
        }
      />
      <DataTable.Cell>
        <StatusDot tone={statusOption(project()).tone} label={statusOption(project()).label} />
      </DataTable.Cell>
      <DataTable.Cell>{project().environmentSummary}</DataTable.Cell>
      <DataTable.Cell>
        <Show when={folderName(project())} fallback="—">
          {(name) => (
            <Tooltip.Root>
              <Tooltip.Trigger asChild={(triggerProps) => <span {...triggerProps()}>{name()}</span>} />
              <Tooltip.Content>{project().directory}</Tooltip.Content>
            </Tooltip.Root>
          )}
        </Show>
      </DataTable.Cell>
      <DataTable.Cell>{project().lastActivity ?? "—"}</DataTable.Cell>
      {/* Menu items render in a portal whose events still reach the row; keep them from opening the project. */}
      <DataTable.Cell align="right" class="pw-projects-row-menu" onClick={(event: MouseEvent) => event.stopPropagation()}>
        <DropdownMenu positioning={{ placement: "bottom-end" }}>
          <DropdownMenuTrigger aria-label={`Actions for ${project().name}`} class={buttonClassName("ghost", "icon")}>
            <MoreHorizontal size={14} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-40">
            <DropdownMenuItem value="open" onSelect={activate}>
              <ExternalLink size={14} aria-hidden="true" />
              Open
            </DropdownMenuItem>
            <Show when={props.onOpenSettings}>
              <DropdownMenuItem value="settings" onSelect={() => props.onOpenSettings?.(project().projectId)}>
                <Settings size={14} aria-hidden="true" />
                Project settings
              </DropdownMenuItem>
            </Show>
            <Show when={project().directory?.trim()}>
              <DropdownMenuItem
                value="copy-path"
                onSelect={() => {
                  const path = project().directory?.trim();
                  if (path) void navigator.clipboard?.writeText(path);
                }}
              >
                <Copy size={14} aria-hidden="true" />
                Copy path
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </DataTable.Cell>
    </DataTable.Row>
  );
}

export function ProjectsScreen(props: ProjectsScreenProps) {
  const [query, setQuery] = createSignal("");
  const [menu, setMenu] = createSignal<RowMenu | null>(null);
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
  const showingAll = () => !query().trim() && filters.clauses().length === 0;

  return (
    <div class="pw-projects">
      <header class="pw-projects-header">
        <h1 class="pw-projects-title">Projects</h1>
        <div class="pw-projects-header-actions">
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
      </header>
      <div class="pw-projects-view-bar">
        <FilterChip
          class="pw-projects-view-chip"
          selected={showingAll()}
          onClick={() => {
            setQuery("");
            filters.clear();
          }}
        >
          All projects
        </FilterChip>
        <ActiveFilterBar
          fields={filters.fields()}
          clauses={filters.clauses()}
          onClausesChange={filters.onClausesChange}
          saved={filters.saved()}
        />
      </div>
      <PageContent class="pw-projects-content pw-scroll-fade">
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
              <DataTable.Root
                rows={filtered()}
                getRowId={(project) => project.projectId}
                estimateRowHeight={48}
                resizableColumns
                columnWidthsKey="projects"
                class="pw-projects-table"
              >
                <DataTable.Table aria-label="Projects">
                  <DataTable.Header>
                    <DataTable.ColumnHeader<ProjectSwitcherItem> id="name" maxWidth={960} sortBy={(project) => project.name}>
                      Name
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<ProjectSwitcherItem> id="status" sortBy={(project) => statusOption(project).label}>
                      Status
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<ProjectSwitcherItem> id="environments" sortBy={(project) => project.environmentSummary}>
                      Environments
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<ProjectSwitcherItem> id="folder" sortBy={folderName}>
                      Folder
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<ProjectSwitcherItem> id="updated" sortBy={updatedAt}>
                      Updated
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<ProjectSwitcherItem> id="actions" width="44px" align="right" sortable={false} resizable={false}>
                      <span class="sr-only">Actions</span>
                    </DataTable.ColumnHeader>
                  </DataTable.Header>
                  <DataTable.Body<ProjectSwitcherItem>>
                    {(project) => (
                      <ProjectRow
                        project={project}
                        onOpen={props.onOpenProject}
                        onOpenSettings={props.onOpenProjectSettings}
                        onMenu={setMenu}
                      />
                    )}
                  </DataTable.Body>
                </DataTable.Table>
              </DataTable.Root>
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
