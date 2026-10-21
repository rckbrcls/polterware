import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import {
  DisclosureButton,
  PageContent,
  PageEmpty,
  animateCollapse,
  type CollapseControls,
} from "@polterware/frontend-design-system";
import { AtlasStatusMark, type AtlasCanvasNode } from "./atlas-canvas";
import "./components-list.css";

/** Components grouped under the domain that contains them. */
export function ComponentsList(props: {
  nodes: readonly AtlasCanvasNode[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const sections = createMemo(() => {
    const domains = props.nodes.filter((node) => node.level === "domain");
    return domains.map((domain) => ({
      domain,
      components: props.nodes.filter((node) => node.level === "component" && node.parentId === domain.id),
    }));
  });
  // Components that left every domain sit directly under their system.
  const loose = createMemo(() => {
    const systems = new Set(props.nodes.filter((node) => node.level === "system").map((node) => node.id));
    return props.nodes.filter(
      (node) => node.level === "component" && (!node.parentId || systems.has(node.parentId)),
    );
  });

  return (
    <PageContent class="p-0">
      <Show
        when={sections().some((section) => section.components.length > 0) || loose().length > 0}
        fallback={
          <PageEmpty
            title="No components yet."
            description="Add a component on the map. It lands inside the domain you have selected."
          />
        }
      >
        <div class="atlas-components">
          <For each={sections()}>
            {(section) => (
              <Show when={section.components.length > 0}>
                <ComponentsSection
                  title={section.domain.title}
                  domain={section.domain}
                  components={section.components}
                  selectedId={props.selectedId}
                  onSelect={props.onSelect}
                />
              </Show>
            )}
          </For>
          <Show when={loose().length > 0}>
            <ComponentsSection
              title="Unassigned"
              components={loose()}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
            />
          </Show>
        </div>
      </Show>
    </PageContent>
  );
}

/** One domain's components; the heading collapses the list (springs to its measured height). */
function ComponentsSection(props: {
  title: string;
  /** Absent for components outside any domain: the heading only collapses. */
  domain?: AtlasCanvasNode;
  components: readonly AtlasCanvasNode[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = createSignal(true);
  let list: HTMLUListElement | undefined;
  let running: CollapseControls | undefined;

  createEffect(
    on(
      open,
      (isOpen) => {
        if (list) running = animateCollapse(list, isOpen, { previous: running });
      },
      { defer: true },
    ),
  );

  return (
    <section class="atlas-components__section" aria-label={props.title}>
      <h2
        class="atlas-components__heading"
        data-selected={props.domain && props.selectedId === props.domain.id ? "true" : undefined}
      >
        <Show
          when={props.domain}
          fallback={
            <span class="atlas-components__domain" data-static>
              <span class="atlas-components__domain-title">{props.title}</span>
            </span>
          }
        >
          {(domain) => (
            <button
              type="button"
              class="atlas-components__domain"
              aria-current={props.selectedId === domain().id ? "true" : undefined}
              data-detail-opener
              data-detail-target-id={domain().id}
              onClick={() => props.onSelect(domain().id)}
            >
              <AtlasStatusMark status={domain().status} />
              <span class="atlas-components__domain-title">{props.title}</span>
            </button>
          )}
        </Show>
        <DisclosureButton
          class="atlas-components__toggle"
          expanded={open()}
          aria-label={`${open() ? "Collapse" : "Expand"} ${props.title}`}
          onClick={() => setOpen((value) => !value)}
        />
      </h2>
      <ul class="atlas-components__list" ref={list} data-state="open">
        <For each={props.components}>
          {(node) => (
            <li>
              <button
                type="button"
                class="atlas-components__row"
                data-selected={props.selectedId === node.id ? "true" : undefined}
                aria-current={props.selectedId === node.id ? "true" : undefined}
                data-detail-opener
                data-detail-target-id={node.id}
                onClick={() => props.onSelect(node.id)}
              >
                <AtlasStatusMark status={node.status} />
                <span class="atlas-components__body">
                  <span class="atlas-components__title">{node.title}</span>
                  <Show when={node.folder}>
                    <span class="atlas-components__meta">{node.folder}</span>
                  </Show>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
