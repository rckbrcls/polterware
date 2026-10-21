import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  A11yDialog, Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Field, File, FileUp, Input, Link, PageError, Play, Plus, StatusChip, Stop,
} from "@polterware/frontend-design-system";
import { useNotesShell } from "@polterware/feature-notes-shell/feature";
import {
  FETCH_TITLES_OFF, FETCH_TITLES_ON, linkHost, previewUrl,
  type AttachmentJSON,
} from "./model";
import { attachmentsStore } from "./store";

export function AttachmentsSection() {
  const shell = useNotesShell();
  const store = attachmentsStore;
  const noteId = () => shell.selectedNoteId() ?? "";
  const [linkOpen, setLinkOpen] = createSignal(false);
  const [linkUrl, setLinkUrl] = createSignal("");
  const [linkTitle, setLinkTitle] = createSignal("");
  const [deleteId, setDeleteId] = createSignal<string>();
  const [viewer, setViewer] = createSignal(0);
  const [viewerOpen, setViewerOpen] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [localBlob, setLocalBlob] = createSignal("");
  let recorder: MediaRecorder | undefined;
  let chunks: Blob[] = [];
  onMount(() => onCleanup(store.connect()));
  createEffect(() => {
    const id = noteId();
    void store.load(id);
  });
  onCleanup(() => { recorder?.stop(); if (localBlob()) URL.revokeObjectURL(localBlob()); });
  const photos = createMemo(() => store.items().filter(item => item.kind === "photo" && previewUrl(item.relPath)));
  const viewerItem = () => photos()[viewer()];
  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const list = event.dataTransfer?.files;
    if (!list?.length || !noteId()) return;
    void store.importDropped(noteId(), list);
  }
  async function startRecording() {
    const permission = await store.requestMicrophone();
    if (permission !== "granted") {
      store.fail(new Error(store.microphoneCopy(permission)));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        if (localBlob()) URL.revokeObjectURL(localBlob());
        if (!chunks.length) return;
        const preview = URL.createObjectURL(blob);
        setLocalBlob(preview);
        void store.importRecording(noteId(), blob).then(() => {
          if (store.state() === "failed") return;
          URL.revokeObjectURL(preview);
          setLocalBlob(current => current === preview ? "" : current);
        });
      };
      recorder.start();
      store.setRecording(true);
    } catch {
      store.fail(new Error(store.microphoneCopy("unavailable")));
    }
  }
  function stopRecording() {
    recorder?.stop();
    recorder = undefined;
    store.setRecording(false);
  }
  async function saveLink() {
    await store.addLink(noteId(), linkUrl().trim(), linkTitle().trim());
    if (store.state() !== "failed") { setLinkOpen(false); setLinkUrl(""); setLinkTitle(""); }
  }
  async function confirmDelete() {
    const id = deleteId();
    if (!id) return;
    await store.remove(noteId(), id);
    if (store.state() !== "failed") setDeleteId(undefined);
  }
  return <Show when={noteId()} fallback={<p>Select a note to attach files.</p>}>
    <div class="flex flex-col gap-3" data-attachments-section>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h3 class="sr-only">Attachments</h3>
          <StatusChip tone={store.state() === "live" ? "ok" : store.state() === "queued" ? "syncing" : store.state() === "unavailable" ? "muted" : "danger"}>
            {store.state() === "live" ? "Live" : store.state() === "queued" ? "Queued" : store.state() === "unavailable" ? "Unavailable" : "Failed"}
          </StatusChip>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Add attachment" class="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-text-primary)]">
            <Plus /> Add
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem value="photo" onSelect={() => void store.pickAndImport(noteId())}>Add photo</DropdownMenuItem>
            <DropdownMenuItem value="file" onSelect={() => void store.pickAndImport(noteId())}>Add file</DropdownMenuItem>
            <DropdownMenuItem value="audio" onSelect={() => void startRecording()}>Record audio</DropdownMenuItem>
            <DropdownMenuItem value="link" onSelect={() => setLinkOpen(true)}>Add link</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p data-fetch-titles class="text-[12px] text-[var(--color-text-muted)]">{store.fetchTitles() ? FETCH_TITLES_ON : FETCH_TITLES_OFF}</p>
      <Show when={store.error()}><p role="alert">{store.error()}</p></Show>
      <Show when={store.state() === "unavailable" && store.error()}>
        <PageError title="Attachments unavailable" message={store.error()} onRetry={() => void store.load(noteId())} />
      </Show>
      <div
        data-drop-zone
        class={dragging() ? "rounded-[var(--radius-item)] outline outline-2 outline-[var(--color-border-strong)]" : ""}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <Card>
          <p class="text-[12px] text-[var(--color-text-muted)]">Drop files here.</p>
        </Card>
      </div>
      <Show when={store.microphone() === "denied" || store.microphone() === "unavailable"}>
        <p role="status">{store.microphoneCopy(store.microphone())}</p>
      </Show>
      <Show when={store.recording()}>
        <div class="flex items-center gap-2">
          <StatusChip tone="syncing">Recording</StatusChip>
          <Button variant="danger" onClick={stopRecording}><Stop /> Stop</Button>
        </div>
      </Show>
      <Show when={localBlob()}>
        <audio controls src={localBlob()} aria-label="Unimported recording preview" />
      </Show>
      <Show when={photos().length}>
        <div class="grid grid-cols-3 gap-2" data-photo-grid>
          <For each={photos()}>{(item, index) => {
            const url = () => previewUrl(item.relPath)!;
            return <button type="button" class="overflow-hidden rounded-[var(--radius-item)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)]"
              data-attachment-id={item.id} data-attachment-kind="photo" data-preview-url={url()}
              aria-label={`Open photo ${item.name ?? item.id}`}
              onClick={() => { setViewer(index()); setViewerOpen(true); }}>
              <img src={url()} alt={item.name ?? "Photo"} class="h-20 w-full object-cover" />
            </button>;
          }}</For>
        </div>
      </Show>
      <ul class="flex flex-col gap-2">
        <For each={store.items()}>{(item, index) => {
          const move = (direction: -1 | 1) => void store.move(noteId(), index(), direction);
          if (item.kind === "link") return <LinkRow item={item} index={index()} total={store.items().length} onMove={move} onDelete={() => setDeleteId(item.id)} />;
          if (item.kind === "photo") return <PhotoRow item={item} index={index()} total={store.items().length} onMove={move} onOpen={() => { const photoIndex = photos().findIndex(entry => entry.id === item.id); setViewer(photoIndex); setViewerOpen(true); }} onDelete={() => setDeleteId(item.id)} />;
          return <FileRow item={item} index={index()} total={store.items().length} onMove={move} onReveal={() => void store.reveal(item)} onDelete={() => setDeleteId(item.id)} />;
        }}</For>
      </ul>
      <Show when={!store.items().length && store.state() === "live"}>
        <p class="text-[12px] text-[var(--color-text-muted)]">No attachments yet. Add a photo, recording, link, or file.</p>
      </Show>
      <A11yDialog open={linkOpen()} title="Add link" size="sm" onClose={() => setLinkOpen(false)}
        footer={<><Button variant="texture" onClick={() => setLinkOpen(false)}>Cancel</Button><Button onClick={() => void saveLink()}>Add link</Button></>}>
        <div class="flex flex-col gap-3">
          <Field label="URL" for="attachment-link-url">
            <Input id="attachment-link-url" value={linkUrl()} onInput={event => setLinkUrl(event.currentTarget.value)} placeholder="https://" />
          </Field>
          <Field label="Title" for="attachment-link-title" hint={store.fetchTitles() ? FETCH_TITLES_ON : FETCH_TITLES_OFF}>
            <Input id="attachment-link-title" value={linkTitle()} onInput={event => setLinkTitle(event.currentTarget.value)} />
          </Field>
        </div>
      </A11yDialog>
      <A11yDialog open={Boolean(deleteId())} title="Delete attachment?" size="sm" onClose={() => setDeleteId(undefined)}
        footer={<><Button variant="texture" onClick={() => setDeleteId(undefined)}>Cancel</Button><Button variant="danger" onClick={() => void confirmDelete()}>Delete</Button></>}>
        <p>This removes the attachment from the note. Files are deleted from Polterware Notes storage.</p>
      </A11yDialog>
      <A11yDialog open={viewerOpen()} title={viewerItem()?.name ?? "Photo"} size="lg" onClose={() => setViewerOpen(false)}
        footer={<><Button variant="ghost" disabled={viewer() === 0} onClick={() => setViewer(value => value - 1)}>Previous</Button>
          <Button variant="ghost" disabled={viewer() >= photos().length - 1} onClick={() => setViewer(value => value + 1)}>Next</Button>
          <Button variant="danger" onClick={() => { const id = viewerItem()?.id; setViewerOpen(false); if (id) setDeleteId(id); }}>Delete</Button></>}>
        <Show when={viewerItem()}>{item => <img src={previewUrl(item().relPath)} alt={item().name ?? "Photo"} class="max-h-[70vh] w-full object-contain" data-preview-url={previewUrl(item().relPath)} />}</Show>
      </A11yDialog>
    </div>
  </Show>;
}

function PhotoRow(props: { item: AttachmentJSON; index: number; total: number; onMove: (direction: -1 | 1) => void; onOpen: () => void; onDelete: () => void }) {
  const url = () => previewUrl(props.item.relPath);
  return <li class="flex flex-col gap-2 rounded-[var(--radius-item)] border border-[var(--color-border-subtle)] p-2"
    data-attachment-id={props.item.id} data-attachment-kind="photo" data-preview-url={url()}>
    <button type="button" class="text-left text-[13px] text-[var(--color-text-primary)]" onClick={props.onOpen}>{props.item.name ?? "Photo"}</button>
    <div class="flex flex-wrap gap-2">
      <Button variant="ghost" disabled={props.index === 0} onClick={() => props.onMove(-1)}>Move up</Button>
      <Button variant="ghost" disabled={props.index === props.total - 1} onClick={() => props.onMove(1)}>Move down</Button>
      <Button variant="ghost" onClick={props.onDelete}>Delete</Button>
    </div>
  </li>;
}

function FileRow(props: { item: AttachmentJSON; index: number; total: number; onMove: (direction: -1 | 1) => void; onReveal: () => void; onDelete: () => void }) {
  const url = () => previewUrl(props.item.relPath);
  return <li class="flex flex-col gap-2 rounded-[var(--radius-item)] border border-[var(--color-border-subtle)] p-2"
    data-attachment-id={props.item.id} data-attachment-kind={props.item.kind} data-preview-url={url()}>
    <div class="flex items-center gap-2">
      {props.item.kind === "audio" ? <Play /> : <File />}
      <span class="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text-primary)]">{props.item.name ?? "Untitled file"}</span>
    </div>
    <Show when={props.item.kind === "audio" && url()}>
      <audio controls src={url()} aria-label={`Play ${props.item.name ?? "audio"}`} />
    </Show>
    <div class="flex flex-wrap gap-2">
      <Button variant="ghost" disabled={props.index === 0} onClick={() => props.onMove(-1)}>Move up</Button>
      <Button variant="ghost" disabled={props.index === props.total - 1} onClick={() => props.onMove(1)}>Move down</Button>
      <Button variant="ghost" disabled={!url()} onClick={props.onReveal}><FileUp /> Reveal in Finder</Button>
      <Button variant="ghost" onClick={props.onDelete}>Delete</Button>
    </div>
  </li>;
}

function LinkRow(props: { item: AttachmentJSON; index: number; total: number; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  const host = () => linkHost(props.item.url);
  return <li class="flex flex-col gap-2 rounded-[var(--radius-item)] border border-[var(--color-border-subtle)] p-2"
    data-attachment-id={props.item.id} data-attachment-kind="link">
    <a href={props.item.url} target="_blank" rel="noreferrer" class="flex items-center gap-2 text-[13px] text-[var(--color-text-primary)]">
      <Link />
      <span class="min-w-0 truncate">{props.item.title || host() || props.item.url}</span>
    </a>
    <p class="text-[12px] text-[var(--color-text-muted)]">{host()}</p>
    <div class="flex flex-wrap gap-2">
      <Button variant="ghost" disabled={props.index === 0} onClick={() => props.onMove(-1)}>Move up</Button>
      <Button variant="ghost" disabled={props.index === props.total - 1} onClick={() => props.onMove(1)}>Move down</Button>
      <Button variant="ghost" onClick={props.onDelete}>Delete</Button>
    </div>
  </li>;
}
