import {
  Button,
  ChevronLeft,
  ChevronRight,
  Search,
} from "@polterware/frontend-design-system";
import { createShortcutLabel } from "@polterware/frontend-state";
import { Show } from "solid-js";
import {
  WorkspaceContextBar,
  type WorkspaceContext,
} from "./context-switchers";
import { CoreStatusMenu, type CoreStatusMenuProps } from "./core-status-menu";
import { TitleBarFrame } from "@polterware/frontend-shell";
import type { EnvironmentItem, ProjectSwitcherItem, ScopeNodeItem, WorkspaceScope } from "./types";

export type TitleBarProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  workspace: WorkspaceContext;
  projects?: ProjectSwitcherItem[];
  environments?: EnvironmentItem[];
  onSelectProject?: (projectId: string) => void;
  onSelectEnvironment?: (environmentId: string) => void;
  onCreateProject?: () => void;
  scopeNodes?: ScopeNodeItem[];
  scope?: WorkspaceScope;
  onSelectScope?: (scope: WorkspaceScope) => void;
  onOpenCommander?: () => void;
  coreStatus?: CoreStatusMenuProps;
};

export function TitleBar(props: TitleBarProps) {
  const commanderShortcut = createShortcutLabel("shell.toggle_commander");

  return (
    <TitleBarFrame>
        <div class="flex shrink-0 items-center [-webkit-app-region:no-drag]">
          <Button
            variant="icon"
            aria-label="Go back"
            disabled={!props.canGoBack}
            onClick={props.onBack}
          >
            <ChevronLeft size={13} />
          </Button>
          <Button
            variant="icon"
            aria-label="Go forward"
            disabled={!props.canGoForward}
            onClick={props.onForward}
          >
            <ChevronRight size={13} />
          </Button>
        </div>

        <div class="flex min-w-0 shrink items-center [-webkit-app-region:no-drag]">
          <WorkspaceContextBar
            context={props.workspace}
            projects={props.projects}
            environments={props.environments}
            onSelectProject={props.onSelectProject}
            onSelectEnvironment={props.onSelectEnvironment}
            onCreateProject={props.onCreateProject}
            scopeNodes={props.scopeNodes}
            scope={props.scope}
            onSelectScope={props.onSelectScope}
          />
        </div>

        <div class="min-w-3 flex-1" aria-hidden />

        <div class="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          <Button
            variant="texture"
            size="icon"
            class="!h-[var(--control-height-md)] !w-[var(--control-height-md)]"
            aria-label="Search or run a command"
            title={`Commander (${commanderShortcut()})`}
            onClick={() => props.onOpenCommander?.()}
          >
            <Search size={14} />
          </Button>
          <Show when={props.coreStatus}>{(coreStatus) => <CoreStatusMenu {...coreStatus()} />}</Show>
        </div>
    </TitleBarFrame>
  );
}
