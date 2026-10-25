import { For, Show, createMemo, createSignal } from "solid-js";
import {
  auroraForId,
  Button,
  Card,
  Folder,
  IconTile,
  PageContent,
  PageEmpty,
  PageLoading,
  PageOffline,
  PageToolbar,
  Plus,
  SearchBar,
  ToolbarIconButton,
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
  onCreateProject: () => void;
};

function secondaryLine(project: ProjectSwitcherItem): { text: string; title?: string } | undefined {
  const description = project.description?.trim();
  if (description) return { text: description };
  const path = project.directory?.trim();
  if (path) return { text: path, title: path };
  return undefined;
}

function ProjectCard(props: {
  project: ProjectSwitcherItem;
  onOpen: (projectId: string) => void;
}) {
  const secondary = () => secondaryLine(props.project);

  function activate() {
    props.onOpen(props.project.projectId);
  }

  return (
    <Card
      variant="texture"
      class="pw-projects-card"
      ref={(element) => {
        element.tabIndex = 0;
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", `Open ${props.project.name}`);
        element.onclick = activate;
        element.onkeydown = (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activate();
        };
      }}
    >
      <IconTile
        size={28}
        tone="architecture"
        aurora={auroraForId(props.project.projectId)}
        seed={props.project.projectId}
      >
        <Folder size={14} />
      </IconTile>
      <div class="pw-projects-card-copy">
        <h2 class="truncate text-[14px] font-medium text-[var(--color-text-primary)]">
          {props.project.name}
        </h2>
        <Show when={secondary()}>
          {(line) => (
            <p class="pw-projects-card-description" title={line().title}>
              {line().text}
            </p>
          )}
        </Show>
      </div>
    </Card>
  );
}

export function ProjectsScreen(props: ProjectsScreenProps) {
  const [query, setQuery] = createSignal("");
  const filtered = createMemo(() => {
    const normalized = query().trim().toLowerCase();
    if (!normalized) return props.projects;
    return props.projects.filter((project) => project.name.toLowerCase().includes(normalized));
  });

  return (
    <div class="pw-projects">
      <PageToolbar.Root>
        <PageToolbar.Leading>
          <SearchBar
            placeholder="Search projects"
            aria-label="Search projects by name"
            value={query()}
            onInput={setQuery}
          />
        </PageToolbar.Leading>
        <PageToolbar.Actions>
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
                      title="No matching projects"
                      description="No project name matches this search."
                    />
                  }
                >
                  <PageEmpty
                    title="No projects yet"
                    description="Create a local project to open its workspace."
                    action={
                      <Button size="sm" variant="texture" textureTone="brand" onClick={() => props.onCreateProject()}>
                        <Plus size={14} />
                        New project
                      </Button>
                    }
                  />
                </Show>
              }
            >
              <ul class="pw-projects-grid" aria-label="Projects">
                <For each={filtered()}>
                  {(project) => <li><ProjectCard project={project} onOpen={props.onOpenProject} /></li>}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </PageContent>
    </div>
  );
}
