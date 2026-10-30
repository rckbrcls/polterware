import { For, Show } from "solid-js";
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
import "./title-bar.css";

/** One step of the title bar's breadcrumb; the last one is where you are and takes no click. */
export type TitleBarCrumb = { label: string; onClick?: () => void };

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
  /** The sidebar's width; history and Home end on its right edge, never before the window controls. */
  sidebarWidth?: number;
  /** Where you are in the app, after Home: project, section, and tab. */
  crumbs?: readonly TitleBarCrumb[];
};

export function TitleBar(props: TitleBarProps) {
  const commanderShortcut = createShortcutLabel("shell.toggle_commander");

  return (
    <TitleBarFrame>
        <div
          class="ml-2 flex shrink-0 items-center justify-end gap-1 [-webkit-app-region:no-drag]"
          style={{ "min-width": props.sidebarWidth ? `calc(${props.sidebarWidth}px - var(--titlebar-traffic-inset, 78px) - 0.5rem)` : undefined }}
        >
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

        <Show when={props.crumbs?.length} fallback={<div class="min-w-3 flex-1" aria-hidden />}>
          <nav aria-label="Breadcrumb" class="pw-titlebar-crumbs">
            <ol>
              <For each={props.crumbs}>
                {(crumb, index) => (
                  <li>
                    <Show when={index() > 0}><ChevronRight size={12} class="pw-titlebar-crumbs__sep" aria-hidden /></Show>
                    <Show
                      when={crumb.onClick && index() < props.crumbs!.length - 1}
                      fallback={<span class="pw-titlebar-crumbs__current" aria-current={index() === props.crumbs!.length - 1 ? "page" : undefined}>{crumb.label}</span>}
                    >
                      <button type="button" class="pw-titlebar-crumbs__link" onClick={() => crumb.onClick?.()}>{crumb.label}</button>
                    </Show>
                  </li>
                )}
              </For>
            </ol>
          </nav>
        </Show>

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
