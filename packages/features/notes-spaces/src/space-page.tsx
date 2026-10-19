import type { JSX } from "solid-js";
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  auroraForId,
  Button,
  Card,
  ContextMenu,
  ExternalLink,
  FileText,
  Dialog,
  Field,
  FormStack,
  IconNameField,
  ChevronRight,
  Folder,
  House,
  PageEmpty,
  PageError,
  PageHeader,
  PageLoading,
  Plus,
  Select,
  Tooltip,
  TemplateCardGrid,
  Zap,
  type PickerIconName,
  type TemplateCardGridItem,
} from "@polterware/frontend-design-system";
import "./spaces.css";
import { NoteDetailHost, useNotesShell } from "@polterware/feature-notes-shell";
import type { Space } from "@polterware/notes-contracts";
import { hexFromPicker, loadDeletePreview, loadSpaces, spacesBridge, moveNoteToSpace, parentPatch, toSpaceNode, wireRev } from "./bridge";
import { SpaceMark, pickerIcon } from "./spaces-tree";
import { bumpSpaces, spacesRevision } from "./session";
import {
  buildSpaceTree,
  canMoveSpace,
  deletePreviewCopy,
  isHexColor,
  spaceAncestors,
  moveTargetOptions,
  nextSortOrder,
  type DeletePreview,
} from "./tree";

function SpaceIconAction(props: { label: string; onClick: () => void; children: JSX.Element; variant?: "secondary" | "ghost" }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <Button {...triggerProps({ onClick: props.onClick, "aria-label": props.label })} variant={props.variant ?? "secondary"} size="icon" class="!h-[var(--control-height-sm)] !min-h-0 !w-[var(--control-height-sm)] !min-w-0 !shrink-0 !rounded-full !p-0">
            {props.children}
          </Button>
        )}
      />
      <Tooltip.Content>
        <span>{props.label}</span>
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

const SWATCHES = ["#7EA8F0", "#9B8AFB", "#6CC7A5", "#F0A66B", "#E47F9A", "#75BFC8"].map((value) => ({
  value,
  label: value,
}));

const ROOT_VALUE = "__root__";

export function SpacePage() {
  const shell = useNotesShell();
  const [spaces, { refetch }] = createResource(spacesRevision, async () => loadSpaces(spacesBridge()));
  const [name, setName] = createSignal("");
  const [color, setColor] = createSignal("#7EA8F0");
  const [icon, setIcon] = createSignal<PickerIconName>("brain");
  const [createName, setCreateName] = createSignal("");
  const [createColor, setCreateColor] = createSignal("#7EA8F0");
  const [createIcon, setCreateIcon] = createSignal<PickerIconName>("brain");
  const [createParent, setCreateParent] = createSignal("");
  const [createOpen, setCreateOpen] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [editParent, setEditParent] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [deletePreview, setDeletePreview] = createSignal<DeletePreview>();
  const selectedId = () => shell.params().id ?? "";
  const noteCollection = createMemo(() => shell.features.find(feature => feature.noteCollection)?.noteCollection);
  const nodes = createMemo(() => (spaces() ?? []).map(toSpaceNode));
  const tree = createMemo(() => buildSpaceTree(nodes()));
  const selected = createMemo(() => (spaces() ?? []).find((space) => space.id === selectedId()));
  const children = createMemo(() => tree().flatMap(function walk(node): typeof node.children {
    if (node.id === selectedId()) return node.children;
    return node.children.flatMap(walk);
  }));
  const ancestors = createMemo(() => spaceAncestors(nodes(), selectedId()));
  // Ark menu items need a non-empty identity, so Root travels as a sentinel here.
  const moveOptions = createMemo(() =>
    moveTargetOptions(nodes(), selectedId()).map((option) => {
      if (option.value === "") return { ...option, value: ROOT_VALUE, icon: <House size={16} /> };
      const node = nodes().find((space) => space.id === option.value);
      return node ? { ...option, icon: <SpaceMark color={node.color} icon={node.icon} size={20} /> } : option;
    }),
  );

  onMount(() => {
    try {
      const stop = spacesBridge().onChange(() => bumpSpaces());
      onCleanup(stop);
    } catch {
      /* Core offline: resource error handles this. */
    }
  });

  createEffect(() => {
    const space = selected();
    setName(space?.name ?? "");
    setColor(isHexColor(space?.color ?? "") ? space!.color : "#7EA8F0");
    setIcon(pickerIcon(space?.icon ?? "brain"));
    setEditParent(space?.parentId ?? "");
  });

  const refresh = async () => {
    bumpSpaces();
    await refetch();
  };

  const createSpace = async () => {
    const label = createName().trim();
    if (!label) return;
    const parentId = createParent();
    try {
      await spacesBridge().spaces.create({
        parentId,
        name: label,
        color: createColor(),
        icon: createIcon(),
        sortOrder: nextSortOrder(nodes(), parentId),
      });
      setCreateName("");
      setCreateOpen(false);
      setMessage("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Space could not be created.");
    }
  };

  const saveSpace = async () => {
    const current = selected();
    if (!current || !name().trim()) return;
    try {
      const nextColor = color();
      await spacesBridge().spaces.update({
        id: current.id,
        expectedRev: wireRev(current.rev),
        name: name().trim(),
        icon: icon(),
        ...(editParent() !== current.parentId && canMoveSpace(nodes(), current.id, editParent()) ? parentPatch(editParent()) : {}),
        ...(isHexColor(nextColor) ? { color: nextColor } : { clearColor: true }),
      });
      setMessage("");
      setEditOpen(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Space could not be updated.");
    }
  };

  const requestDelete = async () => {
    const current = selected();
    if (!current) return;
    try {
      setDeletePreview(await loadDeletePreview(spacesBridge(), nodes(), current.id));
      setEditOpen(false);
      setMessage("");
    } catch {
      setMessage("Space cascade details are unavailable. Try again when the core is online.");
    }
  };

  const confirmDelete = async () => {
    const current = selected();
    const preview = deletePreview();
    if (!current || !preview) return;
    try {
      const result = await spacesBridge().spaces.delete({ id: current.id, expectedRev: wireRev(current.rev) });
      const actual: DeletePreview = { deletedSpaceIds: result.deletedSpaceIds, movedNoteCount: result.movedNoteCount };
      setDeletePreview(undefined);
      setMessage(deletePreviewCopy(actual));
      shell.navigate("/spaces");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Space could not be deleted.");
    }
  };

  const toFolderItems = (list: ReturnType<typeof children>) => list.map((child) => ({
    id: child.id,
    sortOrder: child.sortOrder,
    render: (state: { dropTarget: boolean; noteCount: number }) => (
      <Card class="notes-space-card notes-space-folder !p-0">
        <svg class="notes-space-folder__tab" width="132" height="29" viewBox="0 0 132 29" aria-hidden="true">
          <path class="notes-space-folder__tab-fill" d="M0.5 28V14.5A14 14 0 0 1 14.5 0.5H92.5A14 14 0 0 1 106.5 14.5A14 14 0 0 0 120.5 28.5H132V29H1V28Z" />
          <rect class="notes-space-folder__tab-fill" x="1" y="28" width="131" height="1" />
          <path class="notes-space-folder__tab-line" d="M0.5 28V14.5A14 14 0 0 1 14.5 0.5H92.5A14 14 0 0 1 106.5 14.5A14 14 0 0 0 120.5 28.5H132" fill="none" />
        </svg>
        <div
          data-space-card=""
          data-drop-target={state.dropTarget ? "true" : undefined}
          class="notes-space-folder__body flex cursor-pointer flex-col justify-between p-5 outline-none"
          role="button" tabindex="0" aria-label={`Open Space ${child.name}`}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); shell.navigate(`/space/${encodeURIComponent(child.id)}`); } }}
          onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, spaceId: child.id }); }}
          onClick={() => shell.navigate(`/space/${encodeURIComponent(child.id)}`)}
        >
          <div class="flex items-start justify-between gap-2">
            <SpaceMark color={child.color} icon={child.icon} size={36} aurora={auroraForId(child.id)} />
            <span aria-label={`${state.noteCount} notes`} class="text-[16px] font-medium leading-none tabular-nums text-[var(--color-text-muted)]">{String(state.noteCount).padStart(2, "0")}</span>
          </div>
          <p class="m-0 line-clamp-1 break-words text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">{child.name}</p>
        </div>
      </Card>
    ),
  }));
  const folderItems = createMemo(() => toFolderItems(children()));
  const rootItems = createMemo(() => toFolderItems(tree()));
  const reorderFolders = async (updates: { id: string; sortOrder: number }[]) => {
    const byId = new Map((spaces() ?? []).map((space) => [space.id, space]));
    for (const update of updates) {
      const child = byId.get(update.id);
      if (!child || child.sortOrder === update.sortOrder) continue;
      await spacesBridge().spaces.update({ id: child.id, expectedRev: wireRev(child.rev), sortOrder: update.sortOrder });
    }
    await refresh();
  };
  const dropInto = async (held: { kind: "space" | "note"; id: string }, spaceId: string) => {
    if (held.kind === "note") {
      await moveNoteToSpace(held.id, spaceId);
      bumpSpaces();
      return;
    }
    const current = (spaces() ?? []).find((space) => space.id === held.id);
    if (!current || !canMoveSpace(nodes(), held.id, spaceId) || current.parentId === spaceId) return;
    await spacesBridge().spaces.update({ id: current.id, expectedRev: wireRev(current.rev), ...parentPatch(spaceId) });
    await refresh();
  };
  const canDropInto = (held: { kind: "space" | "note"; id: string }, spaceId: string) =>
    held.kind === "note" || canMoveSpace(nodes(), held.id, spaceId);

  const createPreset = async (input: { name: string; color: string; icon: PickerIconName }) => {
    try {
      await spacesBridge().spaces.create({
        parentId: "",
        name: input.name,
        color: input.color,
        icon: input.icon,
        sortOrder: nextSortOrder(nodes(), ""),
      });
      setMessage("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Space could not be created.");
    }
  };
  const spaceTemplates = (): TemplateCardGridItem[] => [
    { id: "personal", title: "Personal", description: "Everyday notes in one place.", tone: "knowledge", icon: <House size={16} />, onSelect: () => void createPreset({ name: "Personal", color: "#7EA8F0", icon: "home" }) },
    { id: "work", title: "Work", description: "Projects and tasks you are building.", tone: "execution", icon: <House size={16} />, onSelect: () => void createPreset({ name: "Work", color: "#6CC7A5", icon: "folder" }) },
    { id: "ideas", title: "Ideas", description: "Loose thoughts to sort later.", tone: "observability", icon: <Zap size={16} />, onSelect: () => void createPreset({ name: "Ideas", color: "#9B8AFB", icon: "energy" }) },
  ];

  /** File-manager style menu: right-click on empty space or on a child Space card. */
  const [menu, setMenu] = createSignal<{ x: number; y: number; spaceId: string } | null>(null);
  const newNoteIn = (spaceId: string) => { void shell.newNote?.(spaceId ? { spaceId } : {}); };
  const onWorkspaceContextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-space-card],[data-row-id],button,a,input,textarea,select,[role='dialog']")) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, spaceId: selected()?.id ?? "" });
  };

  const openCreate = (parentId = "") => {
    setCreateParent(parentId);
    setCreateName("");
    setCreateColor("#7EA8F0");
    setCreateIcon("brain");
    setCreateOpen(true);
  };

  return (
    <NoteDetailHost><Show when={!spaces.loading} fallback={<PageLoading label="Loading Spaces" />}>
      <Show
        when={!spaces.error}
        fallback={<PageError message="Spaces are unavailable while the local core is offline." onRetry={() => void refresh()} />}
      >
        <div class="flex h-full min-h-0 flex-col">
          <section aria-label="Space workspace" class="flex min-w-0 flex-1 flex-col overflow-auto" onContextMenu={onWorkspaceContextMenu}>
            <Show
              when={selected()}
              fallback={
                <>
                  <Show
                    when={noteCollection() && tree().length}
                    fallback={<>
                  <PageHeader
                        title="Spaces"
                        actions={
                          <Button variant="primary" onClick={() => openCreate()}>
                            Create Space
                          </Button>
                        }
                      />
                      <Show
                        when={tree().length}
                        fallback={
                          <div class="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-3 p-8">
                            <Show when={message()}><p role="alert">{message()}</p></Show>
                            <TemplateCardGrid label="Start from a template" items={spaceTemplates()} />
                          </div>
                        }
                      >
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3 p-4">
                          <For each={tree()}>
                            {(space) => (
                              <Button variant="ghost" class="notes-space-tile" onClick={() => shell.navigate(`/space/${encodeURIComponent(space.id)}`)}>
                                <Card class="flex min-h-[224px] flex-col justify-between !p-5">
                                  <SpaceMark color={space.color} icon={space.icon} size={36} aurora={auroraForId(space.id)} />
                                  <p class="mt-2 break-words text-sm font-medium text-[var(--color-text-primary)]">{space.name}</p>
                                </Card>
                              </Button>
                            )}
                          </For>
                        </div>
                      </Show>

                    </>}
                  >
                    <Dynamic component={noteCollection()!} mode="spaces" spaceId="" folderItems={rootItems()} onReorderFolders={reorderFolders} canDropInto={canDropInto} onDropInto={dropInto}
                      leading={<h1 class="m-0 truncate text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">Spaces</h1>}
                      trailing={<SpaceIconAction label="Create Space" onClick={() => openCreate()}><Plus size={14} aria-hidden="true" /></SpaceIconAction>} />
                  </Show>
                </>
              }
            >
              {(space) => (
                <>
                  <Show when={message()}>
                    <p role="status" class="px-5 pt-4 text-sm text-[var(--color-text-secondary)]">{message()}</p>
                  </Show>
                  <Show when={noteCollection()}>{collection =>
                    <section aria-label="Space notes" class="flex min-h-0 flex-1 flex-col">
                      <Dynamic component={collection()} spaceId={space().id} onCreateSpace={() => openCreate(space().id)} folderItems={folderItems()} onReorderFolders={reorderFolders} canDropInto={canDropInto} onDropInto={dropInto}
                        leading={<nav aria-label="Space path" class="flex min-w-0 items-center gap-0.5">
                          <For each={ancestors()}>{(ancestor) => <>
                            <Button variant="ghost" data-space-id={ancestor.id} aria-label={`Open Space ${ancestor.name}`} class="min-w-0 !gap-2 data-[drop-target=true]:bg-[var(--color-surface-hover)] data-[drop-target=true]:text-[var(--color-text-primary)]" onClick={() => shell.navigate(`/space/${encodeURIComponent(ancestor.id)}`)}><SpaceMark color={ancestor.color} icon={ancestor.icon} size={20} /><span class="truncate text-[13px] font-medium text-[var(--color-text-secondary)]">{ancestor.name}</span></Button>
                            <ChevronRight size={12} aria-hidden="true" class="shrink-0 text-[var(--color-text-muted)]" />
                          </>}</For>
                          <Button variant="ghost" aria-label={`Edit Space ${space().name}`} class="min-w-0 !gap-2" onClick={() => setEditOpen(true)}><SpaceMark color={space().color} icon={space().icon} size={20} /><span class="truncate text-[13px] font-medium text-[var(--color-text-secondary)]">{space().name}</span></Button>
                        </nav>} />
                    </section>
                  }</Show>
                </>
              )}
            </Show>
          </section>
        </div>
        <ContextMenu.Root open={menu() !== null} onOpenChange={(open) => { if (!open) setMenu(null); }} anchorPoint={menu() ? { x: menu()!.x, y: menu()!.y } : null}>
          <ContextMenu.Content>
            <Show when={menu()?.spaceId && menu()?.spaceId !== selected()?.id}>
              <ContextMenu.Item value="open" onSelect={() => { const id = menu()?.spaceId; if (id) shell.navigate(`/space/${encodeURIComponent(id)}`); }}><ExternalLink size={14} aria-hidden="true" />Open</ContextMenu.Item>
              <ContextMenu.Separator />
            </Show>
            <ContextMenu.Item value="add-space" onSelect={() => openCreate(menu()?.spaceId ?? "")}><Folder size={14} aria-hidden="true" />Add Space</ContextMenu.Item>
            <ContextMenu.Item value="add-note" onSelect={() => newNoteIn(menu()?.spaceId ?? "")}><FileText size={14} aria-hidden="true" />Add Note</ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Root>
        <Dialog
          open={editOpen()}
          title="Edit Space"
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <Button variant="danger" class="mr-auto" onClick={() => void requestDelete()}>
                Delete Space
              </Button>
              <Button variant="ghost" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void saveSpace()}>
                Save changes
              </Button>
            </>
          }
        >
          <FormStack>
            <IconNameField
              label="Name"
              name={name()}
              onNameInput={setName}
              icon={icon()}
              onIconChange={setIcon}
              color={color()}
              onColorChange={(details) => setColor(hexFromPicker(details))}
              swatches={SWATCHES}
            />
            <Field label="Move to">
              <Select
                aria-label="Move to"
                value={editParent() || ROOT_VALUE}
                options={moveOptions()}
                onChange={(value) => setEditParent(value === ROOT_VALUE ? "" : value)}
              />
            </Field>
          </FormStack>
        </Dialog>
        <Dialog
          open={createOpen()}
          title="Create Space"
          description="Create a Space to organize notes."
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void createSpace()}>
                Create
              </Button>
            </>
          }
        >
          <FormStack>
            <IconNameField
              label="Name"
              name={createName()}
              onNameInput={setCreateName}
              icon={createIcon()}
              onIconChange={setCreateIcon}
              color={createColor()}
              onColorChange={(details) => setCreateColor(hexFromPicker(details))}
              swatches={SWATCHES}
            />
          </FormStack>
        </Dialog>
        <Dialog
          open={!!deletePreview()}
          title="Delete Space"
          description="Review the cascade before deleting."
          onClose={() => setDeletePreview(undefined)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeletePreview(undefined)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void confirmDelete()}>
                Delete Space
              </Button>
            </>
          }
        >
          <p class="p-4">{deletePreview() ? deletePreviewCopy(deletePreview()!) : ""}</p>
        </Dialog>
      </Show>
    </Show></NoteDetailHost>
  );
}
