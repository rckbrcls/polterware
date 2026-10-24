import { Show, createMemo } from "solid-js";
import { DetailPanel } from "@polterware/frontend-design-system";
import type { WorkspaceEntityLink, WorkspaceCanonEntity } from "@polterware/feature-shell";

export function EntityLinks(props: {
  links: WorkspaceEntityLink[];
  entities?: WorkspaceCanonEntity[];
  onOpenEntity?: (entityId: string, refId: string, kind: string) => void;
  onLinkEntity?: (entityId: string) => void;
  onUnlink?: (linkId: string) => void;
}) {
  const items = createMemo(() =>
    props.links.map((link) => ({
      id: link.id,
      title: link.entityTitle,
      caption: `${link.predicate.toLowerCase()} · ${link.entityKind}`,
    })),
  );

  const candidates = createMemo(() => {
    const linked = new Set(props.links.map((link) => link.entityId));
    return (props.entities ?? [])
      .filter((entity) => !linked.has(entity.id))
      .map((entity) => ({ id: entity.id, title: entity.title, caption: entity.kind }));
  });

  const canLink = () => Boolean(props.onLinkEntity) && candidates().length > 0;

  return (
    <Show
      when={props.links.length > 0 || canLink()}
      fallback={<span class="text-[var(--color-text-muted)]">No linked entities</span>}
    >
      <DetailPanel.LinkedEntities
        class="min-w-0 max-w-full"
        items={items()}
        candidates={candidates()}
        linkLabel="Link entity"
        onOpen={
          props.onOpenEntity
            ? (linkId) => {
                const link = props.links.find((item) => item.id === linkId);
                if (link) props.onOpenEntity?.(link.entityId, link.entityRefId, link.entityKind);
              }
            : undefined
        }
        onRemove={props.onUnlink}
        onLink={props.onLinkEntity}
      />
    </Show>
  );
}
