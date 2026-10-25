import { For, Show, createMemo, createSignal } from "solid-js";
import {
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
  StatusChip,
  type StatusTone,
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

function statusPresentation(status: NonNullable<ProjectSwitcherItem["status"]>): { label: string; tone: StatusTone } {
  if (status === "paused") return { label: "Paused", tone: "warn" };
  if (status === "archived") return { label: "Archived", tone: "muted" };
  return { label: "Active", tone: "ok" };
}

function activityLabel(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text || text === "—") return undefined;
  return text;
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
        <PageToolbar.Leading class="gap-2">
          <span class="pw-page-toolbar-title">Projects</span>
          <SearchBar
            placeholder="Search projects"
            aria-label="Search projects by name"
            value={query()}
            onInput={setQuery}
          />
        </PageToolbar.Leading>
        <PageToolbar.Actions>
          <Button size="sm" variant="texture" textureTone="brand" onClick={() => props.onCreateProject()}>
            <Plus size={14} />
            New project
          </Button>
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
                  {(project) => {
                    const activity = activityLabel(project.lastActivity);
                    return (
                      <li>
                        <Card class="pw-projects-card">
                          <div class="flex min-w-0 items-start gap-3">
                            <IconTile size={28} tone="architecture" seed={project.projectId}>
                              <Folder size={14} />
                            </IconTile>
                            <div class="pw-projects-card-copy flex-1">
                              <h2 class="truncate text-[14px] font-medium text-[var(--color-text-primary)]">
                                {project.name}
                              </h2>
                              <Show when={project.description}>
                                <p class="text-[13px] text-[var(--color-text-secondary)]">{project.description}</p>
                              </Show>
                            </div>
                          </div>
                          <div class="pw-projects-meta">
                            <div class="pw-projects-meta-row">
                              <Show when={project.status}>
                                {(status) => {
                                  const item = statusPresentation(status());
                                  return <StatusChip tone={item.tone}>{item.label}</StatusChip>;
                                }}
                              </Show>
                              <span class="text-[12px] text-[var(--color-text-muted)]">{project.environmentSummary}</span>
                            </div>
                            <Show when={project.directory}>
                              <p class="truncate text-[12px] text-[var(--color-text-muted)]" title={project.directory}>
                                {project.directory}
                              </p>
                            </Show>
                            <Show when={activity}>
                              <p class="text-[12px] text-[var(--color-text-muted)]">Updated {activity}</p>
                            </Show>
                          </div>
                          <div class="mt-auto flex justify-end">
                            <Button size="sm" variant="texture" onClick={() => props.onOpenProject(project.projectId)}>
                              Open
                            </Button>
                          </div>
                        </Card>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </PageContent>
    </div>
  );
}
