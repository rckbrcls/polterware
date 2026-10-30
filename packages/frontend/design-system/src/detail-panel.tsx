import { Show, createEffect, createSignal, createUniqueId, onCleanup, untrack, useContext, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { animate, type AnimationPlaybackControls } from "motion";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";
import { ChevronDown } from "./hugeicons";
import { IconTile, type IconTileTone } from "./icon-tile";
import { FloatingSurfaceProvider } from "./floating-surface";
import { PanelInteractionContext } from "./panel-interaction";
import { DetailPanelLinkedEntities } from "./detail-panel-linked-entities";
import { DetailPanelMenuItem } from "./detail-panel-menu";
import { DetailPanelPrimaryAction } from "./detail-panel-primary-action";
import { DetailPanelProperties, DetailPanelProperty } from "./detail-panel-properties";
import { DetailPanelContext, DetailPanelRoot, useDetailPanel } from "./side-panel/side-panel";
import "./detail-panel.css";

export {
  DETAIL_PANEL_DEFAULT_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  DETAIL_PANEL_MAX_WIDTH,
  DETAIL_PANEL_SIDEBAR_ID,
  clampDetailPanelWidth,
  readDetailPanelWidth,
} from "./side-panel/panel-width";
export type { DetailPanelRootProps } from "./side-panel/side-panel";

export type DetailPanelBodyProps = {
  children: JSX.Element;
  class?: string;
  /** `record` = Main + optional Rail; `document` = knowledge writing canvas. */
  layout?: "record" | "document";
};

export type DetailPanelHeaderProps = {
  /** Optional fixed title above the scrollable body. */
  title?: JSX.Element;
  /** Flows after the title's last word and wraps with it, such as a record's kind and status chips. */
  aside?: JSX.Element;
  class?: string;
};

export type DetailPanelTitleProps = {
  title: JSX.Element;
  icon?: JSX.Element;
  meta?: JSX.Element;
};

export type DetailPanelSectionProps = {
  children: JSX.Element;
  class?: string;
  title?: JSX.Element;
  /** Right-aligned element on the section title row. */
  aside?: JSX.Element;
  /** Folds the section's body behind its title. */
  collapsible?: boolean;
  /** Leading icon, shown in a 24px icon tile before the title. */
  icon?: JSX.Element;
  /** Tone of the icon tile (default neutral). */
  tone?: IconTileTone;
  /** Initial state of a collapsible section (default open). */
  defaultOpen?: boolean;
};

/** Collection controls remain above the divided workspace; standalone pages render inline. */
export function DetailPanelCollectionHeader(props: { children: JSX.Element; class?: string }) {
  const context = useContext(DetailPanelContext);
  if (!context) return props.children;
  return <Show when={context.collectionHeaderHost()}>{(host) =>
    <Portal mount={host()}>
      <div class={`pw-detail-panel__collection-header-part ${props.class ?? ""}`}>{props.children}</div>
    </Portal>
  }</Show>;
}

function DetailPanelCollection(props: { children: JSX.Element; class?: string }) {
  const context = useDetailPanel("Collection");
  return <div inert={context.expanded() ? true : undefined} class={`pw-detail-panel__collection ${props.class ?? ""}`}>{props.children}</div>;
}
function DetailPanelHeader(props: DetailPanelHeaderProps) {
  const context = useDetailPanel("Header");
  createEffect(() => context.setHeaderClass(props.class ?? ""));
  onCleanup(() => context.setHeaderClass(""));
  return <Show when={context.headerHost()}>{(host) =>
    <Show when={props.title}><Portal mount={host()}>
      <Show when={props.aside} fallback={<h2 class="pw-detail-panel__title">{props.title}</h2>}>
        <h2 class="pw-detail-panel__title pw-detail-panel__title--inline">
          {props.title}{" "}<span class="pw-detail-panel__title-aside">{props.aside}</span>
        </h2>
      </Show>
    </Portal></Show>
  }</Show>;
}

export type DetailPanelFooterProps = {
  children: JSX.Element;
  class?: string;
  "aria-label"?: string;
};

/** Fixed action area outside the detail body's scroll viewport. */
function DetailPanelFooter(props: DetailPanelFooterProps) {
  useDetailPanel("Footer");
  return <footer class={`pw-detail-panel__footer ${props.class ?? ""}`} aria-label={props["aria-label"]}>{props.children}</footer>;
}

/** Entity identity uses the fixed header; metadata stays in the scrollable content. */
function DetailPanelTitle(props: DetailPanelTitleProps) {
  const context = useDetailPanel("Title");
  return <>
    <Show when={context.headerHost()}>{host =>
      <Portal mount={host()}>
        <div class="pw-detail-panel__identity">
          <Show when={props.icon}>
            <span class="pw-detail-panel__header-icon" aria-hidden>{props.icon}</span>
          </Show>
          <h2 class="pw-detail-panel__title">{props.title}</h2>
        </div>
      </Portal>
    }</Show>
    <Show when={props.meta}><div class="pw-detail-panel__meta pw-detail-panel__identity-meta">{props.meta}</div></Show>
  </>;
}

function DetailPanelBody(props: DetailPanelBodyProps) {
  useDetailPanel("Body");
  const layout = () => props.layout ?? "record";
  return (
    <div
      class={`pw-detail-panel__body pw-scroll-fade ${props.class ?? ""}`}
      data-layout={layout()}
    >
      <Show when={layout() === "record"} fallback={props.children}>
        <div class="pw-detail-panel__record">{props.children}</div>
      </Show>
    </div>
  );
}

export type DetailPanelMainProps = {
  children: JSX.Element;
  class?: string;
};

function DetailPanelMain(props: DetailPanelMainProps) {
  return (
    <div class={`pw-detail-panel__main ${props.class ?? ""}`}>{props.children}</div>
  );
}

export type DetailPanelRailProps = {
  children: JSX.Element;
  class?: string;
  "aria-label"?: string;
};

function DetailPanelRail(props: DetailPanelRailProps) {
  return (
    <aside aria-label={props["aria-label"]} class={`pw-detail-panel__rail ${props.class ?? ""}`}>{props.children}</aside>
  );
}

/** The section heading's icon: a 24px tile, as in `RailGroup`. Sections are separated by space, never cards. */
function SectionIcon(props: { icon: JSX.Element; tone?: IconTileTone; seed: string }) {
  return <IconTile size={24} tone={props.tone ?? "neutral"} seed={`detail-section-${props.seed}`} class="pw-detail-panel__section-tile">{props.icon}</IconTile>;
}

function DetailPanelSection(props: DetailPanelSectionProps) {
  const titleId = createUniqueId();
  const bodyId = createUniqueId();
  const [open, setOpen] = createSignal(props.defaultOpen !== false);
  const seed = () => (typeof props.title === "string" ? props.title : titleId);
  return (
    <Show when={props.collapsible} fallback={
      <section
        class={`pw-detail-panel__section ${props.class ?? ""}`}
        aria-labelledby={props.title ? titleId : undefined}
      >
        <Show when={props.title || props.aside}>
          <div class="pw-detail-panel__section-heading">
            <div class="pw-detail-panel__section-label">
              <Show when={props.title && props.icon}><SectionIcon icon={props.icon} tone={props.tone} seed={seed()} /></Show>
              <h3 id={titleId} class="pw-detail-panel__section-title" data-tiled={Boolean(props.icon) || undefined}>
                {props.title}
              </h3>
            </div>
            <Show when={props.aside}>{props.aside}</Show>
          </div>
        </Show>
        {props.children}
      </section>
    }>
      <section class={`pw-detail-panel__section pw-detail-panel__section--card ${props.class ?? ""}`} aria-labelledby={titleId} data-open={open()}>
        <div class="pw-detail-panel__section-heading">
          <button type="button" class="pw-detail-panel__section-toggle" aria-expanded={open()} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
            <Show when={props.icon}><SectionIcon icon={props.icon} tone={props.tone} seed={seed()} /></Show>
            <h3 id={titleId} class="pw-detail-panel__section-title" data-tiled={Boolean(props.icon) || undefined}>{props.title}</h3>
            <ChevronDown size={14} class="pw-detail-panel__section-chevron" aria-hidden />
          </button>
          <Show when={props.aside}>{props.aside}</Show>
        </div>
        <DetailPanelSectionBody id={bodyId} open={open()}>{props.children}</DetailPanelSectionBody>
      </section>
    </Show>
  );
}

/** Titled, collapsible block for page content (not the floating panel); shares the animated body. */
export function CollapsibleSection(props: { title: string; icon?: JSX.Element; /** Muted text after the title, such as a count. */ aside?: JSX.Element; /** Controls at the end of the heading, outside the toggle, such as an add button. */ actions?: JSX.Element; defaultOpen?: boolean; class?: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(props.defaultOpen !== false);
  const titleId = createUniqueId();
  const bodyId = createUniqueId();
  return (
    <section aria-labelledby={titleId} data-open={open()} class={`pw-detail-panel__section pw-detail-panel__section--card !border-0 ${props.class ?? ""}`}>
      <div class="pw-collapsible-section__heading [[data-open=true]_&]:pb-4">
        <button type="button" class="pw-detail-panel__section-toggle !w-auto !py-1" aria-expanded={open()} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
          <Show when={props.icon}><span class="pw-detail-panel__section-icon" aria-hidden>{props.icon}</span></Show>
          <h3 id={titleId} class="pw-detail-panel__section-title">{props.title}</h3>
          <Show when={props.aside}><span class="pw-detail-panel__section-aside">{props.aside}</span></Show>
          <ChevronDown size={14} class="pw-detail-panel__section-chevron" aria-hidden />
        </button>
        <Show when={props.actions}><div class="pw-collapsible-section__actions">{props.actions}</div></Show>
      </div>
      <DetailPanelSectionBody id={bodyId} open={open()}>{props.children}</DetailPanelSectionBody>
    </section>
  );
}

/** Collapses to a measured pixel height with the shared springs; snaps on first paint and under reduced motion. */
export function DetailPanelSectionBody(props: { id: string; open: boolean; class?: string; children: JSX.Element }) {
  let clip: HTMLDivElement | undefined;
  let inner: HTMLDivElement | undefined;
  let controls: AnimationPlaybackControls | undefined;
  let first = true;
  const initiallyOpen = untrack(() => props.open);
  createEffect(() => {
    const open = props.open;
    if (!clip || !inner) return;
    controls?.stop();
    const settle = () => {
      if (!clip) return;
      clip.style.height = "";
      clip.style.opacity = "";
      clip.style.overflow = "";
      clip.hidden = !open;
    };
    if (first || prefersReducedMotion()) { first = false; settle(); return; }
    clip.hidden = false;
    clip.style.overflow = "hidden";
    const from = clip.offsetHeight;
    const to = open ? inner.offsetHeight : 0;
    const paint = (value: number) => {
      if (!clip) return;
      clip.style.height = `${value}px`;
      const span = Math.max(1, open ? to : from);
      clip.style.opacity = String(Math.min(1, Math.max(0, value / span)));
    };
    paint(from);
    controls = animate(from, to, {
      ...(open ? spring.moderate : { type: "tween" as const, ...spring.moderate.exit }),
      onUpdate: paint,
      onComplete: settle,
    });
  });
  onCleanup(() => controls?.stop());
  return (
    <div ref={clip} id={props.id} class="pw-detail-panel__section-clip" hidden={!initiallyOpen}>
      <div ref={inner} class={props.class ?? "pw-detail-panel__section-body"}>{props.children}</div>
    </div>
  );
}

function DetailPanelContent(props: { children: JSX.Element; class?: string }) {
  const context = useDetailPanel("Content");
  return (
    <Show when={context.detailHost()}>
      {(mount) => (
        <Portal
          mount={mount()}
          ref={(container) => container.classList.add("pw-detail-panel__portal")}
        >
          <PanelInteractionContext.Provider value={context.interaction}>
            <FloatingSurfaceProvider>
              <div class={`pw-detail-panel__content ${props.class ?? ""}`}>{props.children}</div>
            </FloatingSurfaceProvider>
          </PanelInteractionContext.Provider>
        </Portal>
      )}
    </Show>
  );
}

export const DetailPanel = {
  Root: DetailPanelRoot,
  Collection: DetailPanelCollection,
  CollectionHeader: DetailPanelCollectionHeader,
  Header: DetailPanelHeader,
  Footer: DetailPanelFooter,
  Title: DetailPanelTitle,
  PrimaryAction: DetailPanelPrimaryAction,
  MenuItem: DetailPanelMenuItem,
  Body: DetailPanelBody,
  Main: DetailPanelMain,
  Rail: DetailPanelRail,
  Section: DetailPanelSection,
  Properties: DetailPanelProperties,
  Property: DetailPanelProperty,
  LinkedEntities: DetailPanelLinkedEntities,
  Content: DetailPanelContent,
};

export const SidePanel = DetailPanel;
