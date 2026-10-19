import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import {
  ExternalLink,
  FileText,
  IconTile,
  PICKER_ICONS,
  TreeView,
  type AuroraPalette,
  type PickerIconName,
  type TreeViewNode,
} from "@polterware/frontend-design-system";
import { Dynamic } from "solid-js/web";
import { useNotesShell } from "@polterware/feature-notes-shell";
import type { Space } from "@polterware/notes-contracts";
import { draggedNoteId, hasDraggedNote, loadSpaceNotes, loadSpaces, spacesBridge, moveNoteToSpace, parentPatch, toSpaceNode, wireRev } from "./bridge";
import { bumpSpaces, spacesRevision } from "./session";
import "./spaces.css";
import { createTreeDrag, type TreeDrop } from "./tree-drag";
import {
  buildSpaceTree,
  canMoveSpace,
  previousSiblingId,
  readExpandedSpaceIds,
  siblingOrder,
  writeExpandedSpaceIds,
  type SpaceTreeNode,
} from "./tree";

export function pickerIcon(name: string): PickerIconName {
  return name in PICKER_ICONS ? (name as PickerIconName) : "brain";
}

export function SpaceMark(props: { color: string; icon: string; size?: 16 | 20 | 24 | 28 | 36; aurora?: AuroraPalette }) {
  return (
    <IconTile size={props.size ?? 20} tone="knowledge" aurora={props.aurora} accent={props.color || undefined}>
      <Dynamic component={PICKER_ICONS[pickerIcon(props.icon)]} size={Math.max(10, (props.size ?? 20) - ((props.size ?? 20) >= 36 ? 12 : 8))} />
    </IconTile>
  );
}

const NOTE_PREFIX = "note:";

function labeledNodes(nodes: SpaceTreeNode[], notes: Record<string, { id: string; title: string }[]>, open: (spaceId: string) => void): TreeViewNode[] {
  return nodes.map((node) => {
    const children: TreeViewNode[] = [
      ...labeledNodes(node.children, notes, open),
      ...(notes[node.id] ?? []).map((note) => ({ id: `${NOTE_PREFIX}${node.id}:${note.id}`, label: note.title, icon: <FileText size={16} /> })),
    ];
    return {
      id: node.id,
      label: node.name,
      icon: <SpaceMark color={node.color} icon={node.icon} size={16} />,
      trailing: (
        <button
          type="button"
          class="notes-space-open"
          aria-label={`Open ${node.name}`}
          title={`Open ${node.name}`}
          draggable={false}
          onClick={(event) => { event.stopPropagation(); open(node.id); }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ExternalLink size={12} />
        </button>
      ),
      children: children.length ? children : undefined,
    };
  });
}

function rowId(target: EventTarget | null): string | undefined {
  const element = target instanceof Element ? target.closest("[data-value], [data-space-id]") : null;
  const id = element?.getAttribute("data-value") ?? element?.getAttribute("data-space-id") ?? undefined;
  // A note row stands for the Space that holds it.
  return id?.startsWith(NOTE_PREFIX) ? id.split(":")[1] : id;
}

export function SpacesSidebarTree() {
  const shell = useNotesShell();
  const [spaces] = createResource(spacesRevision, async () => loadSpaces(spacesBridge()));
  const nodes = createMemo(() => (spaces() ?? []).map(toSpaceNode));
  const tree = createMemo(() => buildSpaceTree(nodes()));
  const [spaceNotes] = createResource(
    () => {
      const list = spaces();
      return list ? `${spacesRevision()}:${list.map((space) => space.id).join(",")}` : false;
    },
    async () => loadSpaceNotes(spacesBridge(), (spaces() ?? []).map((space) => space.id)),
  );
  const [expanded, setExpanded] = createSignal<string[]>(readExpandedSpaceIds(localStorage));
  const selectedId = () => shell.params().id ?? "";
  let root: HTMLDivElement | undefined;

  onMount(() => {
    try {
      const stop = spacesBridge().onChange(() => bumpSpaces());
      onCleanup(stop);
    } catch {
      /* Core offline: the page surfaces that state. */
    }
  });

  createEffect(() => {
    writeExpandedSpaceIds(localStorage, expanded());
  });

  const moveTo = async (spaceId: string, parentId: string) => {
    const list = spaces() ?? [];
    if (!canMoveSpace(nodes(), spaceId, parentId)) return;
    const current = list.find((space) => space.id === spaceId);
    if (!current || current.parentId === parentId) return;
    await spacesBridge().spaces.update({
      id: spaceId,
      expectedRev: wireRev(current.rev),
      ...parentPatch(parentId),
    });
    bumpSpaces();
  };

  const reorder = async (space: Space, direction: -1 | 1) => {
    const ordered = siblingOrder(nodes(), space.parentId, space.id, direction);
    if (!ordered) return;
    await spacesBridge().spaces.reorder({ parentId: space.parentId, orderedIds: ordered });
    bumpSpaces();
  };

  const drag = createTreeDrag({
    root: () => root,
    isSpace: (id) => (spaces() ?? []).some((space) => space.id === id),
    isNote: (id) => id.startsWith(NOTE_PREFIX),
    canDrop: (held, drop) => {
      if (drop.kind === "end") return canMoveSpace(nodes(), held, "");
      const targetId = drop.kind === "into" ? drop.target : drop.anchor;
      if (targetId === held) return false;
      const parentId = drop.kind === "into" ? targetId : (nodes().find((space) => space.id === targetId)?.parentId ?? "");
      return canMoveSpace(nodes(), held, parentId);
    },
    commit: async (held: string, drop: TreeDrop) => {
      if (drop.kind === "into") {
        await moveTo(held, drop.target);
        setExpanded((ids) => (ids.includes(drop.target) ? ids : [...ids, drop.target]));
        return;
      }
      const all = nodes();
      const anchor = drop.kind === "end" ? undefined : all.find((space) => space.id === drop.anchor);
      const parentId = anchor?.parentId ?? "";
      const current = all.find((space) => space.id === held);
      if (!current) return;
      if (current.parentId !== parentId) await moveTo(held, parentId);
      const siblings = all
        .filter((space) => space.parentId === parentId && space.id !== held)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((space) => space.id);
      const at = anchor ? siblings.indexOf(anchor.id) : siblings.length;
      siblings.splice(drop.kind === "after" && anchor ? at + 1 : Math.max(0, at), 0, held);
      await spacesBridge().spaces.reorder({ parentId, orderedIds: siblings });
      bumpSpaces();
    },
  });

  const onTreeKey = async (event: KeyboardEvent) => {
    if (!event.altKey) return;
    const id = selectedId();
    const current = (spaces() ?? []).find((space) => space.id === id);
    if (!current) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      await reorder(current, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      await reorder(current, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const parent = nodes().find((space) => space.id === current.parentId);
      await moveTo(current.id, parent?.parentId ?? "");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      const sibling = previousSiblingId(nodes(), current.id);
      if (sibling) await moveTo(current.id, sibling);
    }
  };

  onMount(() => {
    const swallow = (event: MouseEvent) => {
      if (!drag.consumeClick()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    root?.addEventListener("click", swallow, true);
    onCleanup(() => root?.removeEventListener("click", swallow, true));
  });

  return (
    <div
      ref={root}
      onScroll={(event) => {
        const el = event.currentTarget;
        el.toggleAttribute("data-scrolled", el.scrollTop > 0);
        el.toggleAttribute("data-at-end", el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
      }}
      class="notes-sidebar-tree flex min-h-0 flex-col gap-2"
      onKeyDown={(event) => void onTreeKey(event)}
      onPointerDown={drag.onPointerDown}
      onDragOver={(event) => {
        if (!hasDraggedNote(event.dataTransfer)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const noteId = draggedNoteId(event.dataTransfer);
        if (!noteId) return;
        event.preventDefault();
        void moveNoteToSpace(noteId, rowId(event.target) ?? "").then(() => bumpSpaces());
      }}
    >
      <Show when={!spaces.loading} fallback={<p class="text-xs text-[var(--color-text-muted)]">Loading Spaces…</p>}>
        <Show when={!spaces.error} fallback={<p role="status">Spaces unavailable</p>}>
          <Show when={tree().length}>
            <TreeView
              label="Spaces"
              nodes={labeledNodes(tree(), spaceNotes() ?? {}, (id) => shell.navigate(`/space/${encodeURIComponent(id)}`))}
              indicator={false}
              guides={false}
              expandedValue={expanded()}
              selectedValue={selectedId() ? [selectedId()] : []}
              onExpandedChange={(event) => setExpanded(event.expandedValue)}
              onSelectionChange={(event) => {
                const id = event.selectedValue[0];
                if (!id) return;
                // A Space row only expands; its open button navigates to the Space page.
                if (id.startsWith(NOTE_PREFIX)) shell.navigate(`/note/${encodeURIComponent(id.slice(id.lastIndexOf(":") + 1))}`);
              }}
            />
          </Show>
        </Show>
      </Show>
    </div>
  );
}
