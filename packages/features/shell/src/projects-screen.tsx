import { Show, createMemo, createSignal } from "solid-js";
import {
  ActiveFilterBar,
  Copy,
  DataTable,
  EntityContextMenu,
  EntityMenuButton,
  ExternalLink,
  FilterChip,
  Folder,
  FolderKanban,
  FilterPopover,
  IconTile,
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
  createEntityContextMenu,
  matchClauses,
  type EntityAction,
  type EntityContextMenuController,
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

/** One list for a project's "…" button and its right-click menu. */
function projectActions(
  project: ProjectSwitcherItem,
  onOpen: (projectId: string) => void,
  onOpenSettings?: (projectId: string) => void,
): EntityAction[] {
  const path = project.directory?.trim();
  return [
    { id: "open", label: "Open", icon: ExternalLink, hint: "↵", onSelect: () => onOpen(project.projectId) },
    ...(onOpenSettings
      ? [{ id: "settings", label: "Project settings", icon: Settings, onSelect: () => onOpenSettings(project.projectId) }]
      : []),
    ...(path ? [{ id: "copy-path", label: "Copy path", icon: Copy, onSelect: () => void navigator.clipboard?.writeText(path) }] : []),
  ];
}

function ProjectRow(props: {
  project: ProjectSwitcherItem;
  onOpen: (projectId: string) => void;
  onOpenSettings?: (projectId: string) => void;
  menu: EntityContextMenuController;
}) {
  const project = () => props.project;
  const activate = () => props.onOpen(project().projectId);
  const actions = () => projectActions(project(), props.onOpen, props.onOpenSettings);

  return (
    <DataTable.Row
      row={project()}
      rowId={project().projectId}
      aria-label={`Open ${project().name}`}
      onActivate={activate}
      onContextMenu={(event) => props.menu.open(event, actions())}
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
      <DataTable.Cell align="right" class="pw-projects-row-menu">
        <EntityMenuButton label={`Actions for ${project().name}`} actions={actions()} />
      </DataTable.Cell>
    </DataTable.Row>
  );
}

export function ProjectsScreen(props: ProjectsScreenProps) {
  const [query, setQuery] = createSignal("");
  const menu = createEntityContextMenu();
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
                        menu={menu}
                      />
                    )}
                  </DataTable.Body>
                </DataTable.Table>
              </DataTable.Root>
            </Show>
          </Show>
        </Show>
      </PageContent>
      <EntityContextMenu menu={menu} />
    </div>
  );
}
