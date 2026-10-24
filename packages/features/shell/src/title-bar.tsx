import {
  Button,
  ChevronLeft,
  ChevronRight,
  Search,
} from "@polterware/frontend-design-system";
import { createShortcutLabel } from "@polterware/frontend-state";
import {
  WorkspaceContextBar,
  type WorkspaceContext,
} from "./context-switchers";
import { TitleBarFrame } from "@polterware/frontend-shell";
import type { EnvironmentItem, ScopeNodeItem, WorkspaceScope } from "./types";

export type TitleBarProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  workspace: WorkspaceContext;
  environments?: EnvironmentItem[];
  onSelectEnvironment?: (environmentId: string) => void;
  scopeNodes?: ScopeNodeItem[];
  scope?: WorkspaceScope;
  onSelectScope?: (scope: WorkspaceScope) => void;
  onOpenCommander?: () => void;
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
            environments={props.environments}
            onSelectEnvironment={props.onSelectEnvironment}
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
        </div>
    </TitleBarFrame>
  );
}
