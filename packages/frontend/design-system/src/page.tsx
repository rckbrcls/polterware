import type { JSX } from "solid-js";
import { DetailPanelCollectionHeader } from "./detail-panel";
/* PageToolbar shares layout rules with tabs (pw-page-toolbar in tabs.css). */
import "./tabs.css";

/**
 * Detail / entity header only. Section indexes use compound PageToolbar slots —
 * do not put section titles here; they live in the window title bar.
 */
export function PageHeader(props: {
  title: string;
  subtitle?: JSX.Element;
  actions?: JSX.Element;
  breadcrumb?: JSX.Element;
  /** Optional leading mark (e.g. service brand icon) before the title. */
  leading?: JSX.Element;
  /** Bottom rule. Defaults to on. */
  divider?: boolean;
}) {
  const divider = () => props.divider !== false;
  return (
    <header
      class={`pw-page-header flex min-h-[var(--page-header-height)] shrink-0 items-center gap-3 px-4 py-1.5 ${divider() ? "border-b border-[var(--color-border-subtle)]" : ""}`}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "12px",
        "min-height": "var(--page-header-height)",
        "flex-shrink": "0",
        padding: "6px 16px",
        "border-bottom": divider() ? "1px solid var(--color-border-subtle)" : "0",
      }}
    >
      <div class="min-w-0 flex-1" style={{ "min-width": 0, flex: "1 1 auto" }}>
        {props.breadcrumb}
        <div
          class="flex flex-wrap items-center gap-2"
          style={{ display: "flex", "flex-wrap": "wrap", "align-items": "center", gap: "8px" }}
        >
          {props.leading ? (
            <span class="inline-flex shrink-0 items-center justify-center">{props.leading}</span>
          ) : null}
          <h1
            class="truncate text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]"
            style={{
              margin: 0,
              "font-size": "15px",
              "font-weight": 600,
              color: "var(--color-text-primary)",
              "white-space": "nowrap",
              overflow: "hidden",
              "text-overflow": "ellipsis",
            }}
          >
            {props.title}
          </h1>
          {props.subtitle}
        </div>
      </div>
      {props.actions ? (
        <div
          class="flex shrink-0 items-center gap-2"
          style={{ display: "flex", "align-items": "center", gap: "8px", "flex-shrink": 0 }}
        >
          {props.actions}
        </div>
      ) : null}
    </header>
  );
}

export type PageToolbarRootProps = {
  children: JSX.Element;
  class?: string;
};

export type PageToolbarSlotProps = {
  children: JSX.Element;
  class?: string;
};

/**
 * First row inside MainSurface. Plain bar, no fade.
 */
function PageToolbarRoot(props: PageToolbarRootProps) {
  return (
    <DetailPanelCollectionHeader>
      <div class={`pw-page-toolbar ${props.class ?? ""}`}>
        {props.children}
      </div>
    </DetailPanelCollectionHeader>
  );
}

function PageToolbarTabs(props: PageToolbarSlotProps) {
  return (
    <div class={`pw-page-toolbar-tabs min-w-0 flex-1 ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
}

function PageToolbarLeading(props: PageToolbarSlotProps) {
  return (
    <div class={`pw-page-toolbar-leading min-w-0 flex-1 ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
}

/** The middle group of the toolbar, such as a `Breadcrumb`: spaced between the tabs and the actions. */
function PageToolbarCenter(props: PageToolbarSlotProps) {
  return (
    <div class={`pw-page-toolbar-center ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
}

function PageToolbarActions(props: PageToolbarSlotProps) {
  return (
    <div class={`pw-page-toolbar-actions flex shrink-0 items-center gap-2 ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
}

export const PageToolbar = {
  Root: PageToolbarRoot,
  Tabs: PageToolbarTabs,
  Leading: PageToolbarLeading,
  Center: PageToolbarCenter,
  Actions: PageToolbarActions,
};

export function PageContent(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      class={`pw-page-content min-h-0 flex-1 overflow-auto ${props.class ?? ""}`}
      style={{ "min-height": 0, flex: "1 1 auto", overflow: "auto" }}
    >
      {props.children}
    </div>
  );
}
