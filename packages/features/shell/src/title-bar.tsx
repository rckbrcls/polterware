import {
  Button,
  ChevronLeft,
  ChevronRight,
  Home01Icon,
  Search,
  Settings,
  TextureButtonGroup,
} from "@polterware/frontend-design-system";
import { createShortcutLabel } from "@polterware/frontend-state";
import { TitleBarFrame } from "@polterware/frontend-shell";

export type TitleBarProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onGoHome?: () => void;
  onOpenCommander?: () => void;
  onOpenAppSettings?: () => void;
  /** True while App settings is open. */
  appSettingsOpen?: boolean;
};

export function TitleBar(props: TitleBarProps) {
  const commanderShortcut = createShortcutLabel("shell.toggle_commander");

  return (
    <TitleBarFrame>
        <div class="ml-2 flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          <TextureButtonGroup
            label="History"
            items={[
              { label: "Go back", icon: <ChevronLeft size={13} />, disabled: !props.canGoBack, onClick: props.onBack },
              { label: "Go forward", icon: <ChevronRight size={13} />, disabled: !props.canGoForward, onClick: props.onForward },
            ]}
          />
          <Button
            variant="texture"
            size="icon"
            aria-label="Home"
            title="Projects"
            onClick={() => props.onGoHome?.()}
          >
            <Home01Icon size={13} />
          </Button>
        </div>

        <div class="min-w-3 flex-1" aria-hidden />

        <div class="ml-auto flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          <Button
            variant="texture"
            size="icon"
            aria-label="Search or run a command"
            title={`Commander (${commanderShortcut()})`}
            onClick={() => props.onOpenCommander?.()}
          >
            <Search size={14} />
          </Button>
          <Button
            variant="texture"
            size="icon"
            aria-label="App settings"
            aria-pressed={Boolean(props.appSettingsOpen)}
            title="App settings"
            onClick={() => props.onOpenAppSettings?.()}
          >
            <Settings size={14} />
          </Button>
        </div>
    </TitleBarFrame>
  );
}
