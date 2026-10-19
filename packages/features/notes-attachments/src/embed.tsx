import { Show, createMemo, createSignal, onMount, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { File, Link, Play, XIcon, Button, A11yDialog, Field, Input, Stop } from "@polterware/frontend-design-system";
import type { NoteAttachmentsApi } from "@polterware/feature-notes-shell/feature";
import { FETCH_TITLES_OFF, FETCH_TITLES_ON, linkHost, previewUrl } from "./model";
import { attachmentsStore } from "./store";

function AttachmentCard(props: { noteId: string; attachmentId: string; remove: () => void }) {
  const store = attachmentsStore;
  onMount(() => {
    onCleanup(store.connect());
    if (props.noteId && !store.items().some(entry => entry.id === props.attachmentId)) void store.load(props.noteId);
  });
  const item = createMemo(() => store.items().find(entry => entry.id === props.attachmentId));
  const url = () => previewUrl(item()?.relPath);
  async function destroy() {
    await store.remove(props.noteId, props.attachmentId);
    if (store.state() !== "failed") props.remove();
  }
  return <div class="pw-attachment-card" data-attachment-id={props.attachmentId} data-attachment-kind={item()?.kind ?? "missing"}>
    <Button variant="icon" class="pw-attachment-card__remove" aria-label="Delete attachment" title="Delete attachment" onClick={() => void destroy()}><XIcon size={12} /></Button>
    <Show when={item()} fallback={<span class="pw-attachment-card__missing"><File size={14} /> Attachment unavailable</span>}>
      {entry => <>
        <Show when={entry().kind === "photo" && url()}>
          <img src={url()} alt={entry().name ?? "Photo"} class="pw-attachment-card__image" />
        </Show>
        <Show when={entry().kind === "link"}>
          <a href={entry().url} target="_blank" rel="noreferrer" class="pw-attachment-card__row">
            <Link size={14} /><span class="pw-attachment-card__title">{entry().title || linkHost(entry().url) || entry().url}</span>
            <span class="pw-attachment-card__meta">{linkHost(entry().url)}</span>
          </a>
        </Show>
        <Show when={entry().kind === "audio" || entry().kind === "file"}>
          <div class="pw-attachment-card__row">
            {entry().kind === "audio" ? <Play size={14} /> : <File size={14} />}
            <span class="pw-attachment-card__title">{entry().name ?? "Untitled file"}</span>
          </div>
          <Show when={entry().kind === "audio" && url()}>
            <audio controls src={url()} aria-label={`Play ${entry().name ?? "audio"}`} class="pw-attachment-card__audio" />
          </Show>
        </Show>
      </>}
    </Show>
  </div>;
}

type Ask<T> = { noteId: string; resolve: (value: T) => void };
const [linkAsk, setLinkAsk] = createSignal<Ask<string[]>>();
const [recordAsk, setRecordAsk] = createSignal<Ask<string[]>>();
let hostMounted = false;

/** Dialogs live outside the editor; mount one detached Solid root the first time they are needed. */
function ensureDialogs() {
  if (hostMounted) return;
  hostMounted = true;
  const element = document.createElement("div");
  document.body.appendChild(element);
  render(() => <><LinkDialog /><RecordDialog /></>, element);
}

function LinkDialog() {
  const store = attachmentsStore;
  const [url, setUrl] = createSignal("");
  const [title, setTitle] = createSignal("");
  const finish = (ids: string[]) => { linkAsk()?.resolve(ids); setLinkAsk(undefined); setUrl(""); setTitle(""); };
  async function save() {
    const ask = linkAsk();
    if (!ask) return;
    const ids = await store.addLink(ask.noteId, url().trim(), title().trim());
    if (store.state() !== "failed") finish(ids);
  }
  return <A11yDialog open={Boolean(linkAsk())} title="Add link" size="sm" onClose={() => finish([])}
    footer={<><Button variant="ghost" onClick={() => finish([])}>Cancel</Button><Button onClick={() => void save()}>Add link</Button></>}>
    <div class="flex flex-col gap-3">
      <Field label="URL" for="embed-link-url">
        <Input id="embed-link-url" value={url()} onInput={event => setUrl(event.currentTarget.value)} placeholder="https://" />
      </Field>
      <Field label="Title" for="embed-link-title" hint={store.fetchTitles() ? FETCH_TITLES_ON : FETCH_TITLES_OFF}>
        <Input id="embed-link-title" value={title()} onInput={event => setTitle(event.currentTarget.value)} />
      </Field>
      <Show when={store.error()}><p role="alert" class="text-xs">{store.error()}</p></Show>
    </div>
  </A11yDialog>;
}

function RecordDialog() {
  const store = attachmentsStore;
  let recorder: MediaRecorder | undefined;
  let chunks: Blob[] = [];
  const [busy, setBusy] = createSignal(false);
  function finish(ids: string[]) { recordAsk()?.resolve(ids); setRecordAsk(undefined); setBusy(false); }
  async function start() {
    const permission = await store.requestMicrophone();
    if (permission !== "granted") { store.fail(new Error(store.microphoneCopy(permission))); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const noteId = recordAsk()?.noteId;
        if (!chunks.length || !noteId) { finish([]); return; }
        setBusy(true);
        void store.importRecording(noteId, new Blob(chunks, { type: mimeType || "audio/webm" })).then(finish);
      };
      recorder.start();
      store.setRecording(true);
    } catch { store.fail(new Error(store.microphoneCopy("unavailable"))); }
  }
  function stop() { recorder?.stop(); recorder = undefined; store.setRecording(false); }
  function cancel() {
    if (recorder) { chunks = []; recorder.stop(); recorder = undefined; store.setRecording(false); }
    finish([]);
  }
  return <A11yDialog open={Boolean(recordAsk())} title="Record audio" size="sm" onClose={cancel}
    footer={<Button variant="ghost" onClick={cancel}>Cancel</Button>}>
    <div class="flex flex-col gap-3">
      <Show when={store.recording()} fallback={<Button disabled={busy()} onClick={() => void start()}>{busy() ? "Saving…" : "Start recording"}</Button>}>
        <Button variant="danger" onClick={stop}><Stop size={14} /> Stop and insert</Button>
      </Show>
      <Show when={store.error()}><p role="alert" class="text-xs">{store.error()}</p></Show>
    </div>
  </A11yDialog>;
}

export const noteAttachments: NoteAttachmentsApi = {
  render: (noteId, attachmentId, block) => <AttachmentCard noteId={noteId} attachmentId={attachmentId} remove={block.remove} />,
  pick: noteId => attachmentsStore.pickAndImport(noteId),
  drop: (noteId, files) => attachmentsStore.importDropped(noteId, files),
  actions: [
    { id: "attachment-audio", label: "Audio recording", icon: props => <Play size={props.size ?? 14} />,
      run: noteId => { ensureDialogs(); return new Promise<string[]>(resolve => setRecordAsk({ noteId, resolve })); } },
    { id: "attachment-link", label: "Link", icon: props => <Link size={props.size ?? 14} />,
      run: noteId => { ensureDialogs(); return new Promise<string[]>(resolve => setLinkAsk({ noteId, resolve })); } },
  ],
};
