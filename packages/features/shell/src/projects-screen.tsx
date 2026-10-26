import { For, Show, createMemo, createSignal } from "solid-js";
import {
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
  IconTile,
  MoreHorizontal,
  PageContent,
  PageEmpty,
  TemplateCardGrid,
  PageLoading,
  PageOffline,
  PageToolbar,
  Plus,
  SearchBar,
  Settings,
  ToolbarIconButton,
  buttonClassName,
} from "@polterware/frontend-design-system";
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
  const filtered = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    if (!normalized) return props.projects;
    return props.projects.filter((project) => project.name.toLowerCase().includes(normalized));
  });

  return (
    <div class="pw-projects">
      <PageToolbar.Root>
        <PageToolbar.Leading>{null}</PageToolbar.Leading>
        <PageToolbar.Actions>
          <SearchBar
            placeholder="Search projects"
            aria-label="Search projects by name"
            value={query()}
            onInput={setQuery}
          />
          <ToolbarIconButton label="New project" onClick={() => props.onCreateProject()}>
            <Plus size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>
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
