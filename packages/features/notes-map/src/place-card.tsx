import { For, Show, createEffect, createSignal, onCleanup, on, type JSX } from "solid-js";
import { useNotesShell } from "@polterware/feature-notes-shell/feature";
import {
  Button, Field, Input, PageError, PageLoading, SegmentedControl, Slider,
} from "@polterware/frontend-design-system";
import { DEFAULT_MAP_CENTER, MapView } from "@polterware/frontend-map";
import { searchAddress } from "./geocoding";
import { browserBridge, type MapBridge } from "./bridge";
import {
  DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M, PLACE_NOTICE, clampRadius, draftFromPlace, errorText,
  parseCoordinate, placeFromDraft, revisionString, type Honesty, type NoteJSON, type PlaceDraft, type PlaceJSON, type SettingsJSON,
} from "./model";

export function PlaceCard(): JSX.Element {
  const shell = useNotesShell();
  const noteId = () => shell.selectedNoteId();
  return <Show when={noteId()}>{id => <PlaceEditor noteId={id()} />}</Show>;
}

function PlaceEditor(props: { noteId: string }) {
  const [draft, setDraft] = createSignal<PlaceDraft>(draftFromPlace());
  const [saved, setSaved] = createSignal(false);
  const [rev, setRev] = createSignal("0");
  const [geocoding, setGeocoding] = createSignal(false);
  const [address, setAddress] = createSignal("");
  const [addressHits, setAddressHits] = createSignal<import("@polterware/frontend-map").GeocodeHit[]>([]);
  const [addressError, setAddressError] = createSignal("");
  const [addressBusy, setAddressBusy] = createSignal(false);
  let addressGeneration = 0;
  onCleanup(() => { addressGeneration += 1; setGeocoding(false); });
  const [pending, setPending] = createSignal(true);
  const [busy, setBusy] = createSignal("");
  const [saveState, setSaveState] = createSignal<Honesty>("unavailable");
  const [loadError, setLoadError] = createSignal("");
  const [formError, setFormError] = createSignal("");
  const [coreError, setCoreError] = createSignal("");
  const lat = () => parseCoordinate(draft().lat, "lat");
  const lng = () => parseCoordinate(draft().lng, "lng");
  const pinReady = () => lat() !== undefined && lng() !== undefined;

  function patch(partial: Partial<PlaceDraft>) {
    setDraft(current => ({ ...current, ...partial }));
    setSaveState("queued");
    setFormError("");
  }

  async function withBridge<T>(label: string, run: (bridge: MapBridge) => Promise<T>): Promise<T | undefined> {
    try {
      setBusy(label);
      const result = await run(browserBridge());
      setCoreError("");
      return result;
    } catch (error) {
      setCoreError(errorText(error));
      setSaveState("failed");
      return undefined;
    } finally {
      setBusy("");
    }
  }

  async function load(id: string) {
    setPending(true); setLoadError("");
    try {
      const bridge = browserBridge();
      const [noteResponse, settingsResponse] = await Promise.all([
        bridge.notes.get({ id, include: { place: true } }) as Promise<{ note?: NoteJSON }>,
        bridge.settings.get({}).catch(() => ({ settings: {} })) as Promise<{ settings?: SettingsJSON }>,
      ]);
      const note = noteResponse.note;
      if (!note) throw new Error("Note unavailable. It may have been deleted.");
      setRev(revisionString(note.rev));
      setDraft(draftFromPlace(note.place));
      setSaved(Boolean(note.place && Number.isFinite(note.place.lat)));
      setGeocoding(settingsResponse.settings?.mapGeocoding === true);
      setSaveState("live");
    } catch (error) {
      setLoadError(errorText(error));
      setSaveState("unavailable");
    } finally {
      setPending(false);
    }
  }

  async function findAddress() {
    if (!geocoding() || addressBusy()) return;
    const ticket = ++addressGeneration;
    setAddressBusy(true); setAddressHits([]); setAddressError("");
    try {
      const hits = await searchAddress(address(), () => geocoding() && ticket === addressGeneration);
      if (ticket !== addressGeneration) return;
      setAddressHits(hits);
      if (!hits.length) setAddressError("No address results.");
    } catch (error) {
      if (ticket === addressGeneration) setAddressError(errorText(error));
    } finally {
      if (ticket === addressGeneration) setAddressBusy(false);
    }
  }

  async function refreshGeocoding() {
    try {
      const result = await browserBridge().settings.get({}) as { settings?: SettingsJSON };
      setGeocoding(result.settings?.mapGeocoding === true);
    } catch { setGeocoding(false); }
    addressGeneration += 1; setAddressBusy(false); setAddressHits([]); setAddressError("");
  }

  async function save() {
    const place = placeFromDraft(props.noteId, draft());
    if (!place) { setFormError("Enter a valid latitude and longitude."); return; }
    const result = await withBridge("save", bridge => bridge.places.set({ expectedRev: rev(), place }) as Promise<{ place?: PlaceJSON }>);
    if (!result?.place) return;
    setDraft(draftFromPlace(result.place));
    setSaved(true);
    const note = await withBridge("reload", bridge => bridge.notes.get({ id: props.noteId, include: { place: true } }) as Promise<{ note?: NoteJSON }>);
    if (note?.note) setRev(revisionString(note.note.rev));
    setSaveState("live");
  }

  async function clearPlace() {
    const result = await withBridge("clear", bridge => bridge.places.clear({ noteId: props.noteId, expectedRev: rev() }));
    if (result === undefined && saveState() === "failed") return;
    setDraft(draftFromPlace());
    setSaved(false);
    const note = await withBridge("reload", bridge => bridge.notes.get({ id: props.noteId, include: { place: true } }) as Promise<{ note?: NoteJSON }>);
    if (note?.note) setRev(revisionString(note.note.rev));
    setSaveState("live");
  }

  function dropPin() {
    patch({
      lat: String(lat() ?? DEFAULT_MAP_CENTER.lat),
      lng: String(lng() ?? DEFAULT_MAP_CENTER.lng),
      radiusM: draft().radiusM || DEFAULT_RADIUS_M,
    });
  }

  createEffect(on(() => props.noteId, id => {
    addressGeneration += 1; setAddressHits([]); setAddressError(""); setAddressBusy(false);
    void load(id);
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = browserBridge().onChange(event => {
        if (event.resync || event.changes.some(change => change.entity === "settings")) void refreshGeocoding();
        if (saveState() === "queued") return;
        if (event.resync || event.changes.some(change => ["place", "places", "note", "notes", "settings"].includes(change.entity))) {
          void load(id);
        }
      });
    } catch { /* Bridge missing until Desktop hosts the page. */ }
    onCleanup(() => unsubscribe?.());
  }));

  return (
    <section data-place-card class="flex flex-col gap-3">
      <p class="sr-only">Place</p>
      <p class="text-[12px] text-[var(--color-text-muted)]">{PLACE_NOTICE}</p>
      <Show when={pending()}><PageLoading label="Loading place" /></Show>
      <Show when={loadError()}><PageError title="Place unavailable" message={loadError()} onRetry={() => void load(props.noteId)} /></Show>
      <Show when={!pending() && !loadError()}>
        <Show when={pinReady()}>
          <div class="h-52 overflow-hidden rounded-[var(--radius-card)]">
            <MapView
              online
              pickEnabled
              center={{ lat: lat() ?? DEFAULT_MAP_CENTER.lat, lng: lng() ?? DEFAULT_MAP_CENTER.lng }}
              zoom={14}
              markers={[{ id: props.noteId, lat: lat()!, lng: lng()!, radius: draft().radiusM }]}
              selectedId={props.noteId}
              onPick={pick => patch({ lat: String(pick.lat), lng: String(pick.lng) })}
            />
          </div>
          <p class="text-[12px] text-[var(--color-text-muted)]">Drag the pin or Shift-click the map to move it.</p>
        </Show>
        <Show when={geocoding()}>
          <Field label="Address" for="place-address">
            <Input id="place-address" value={address()} onInput={(event: Event) => { addressGeneration += 1; setAddressBusy(false); setAddressHits([]); setAddressError(""); setAddress((event.currentTarget as HTMLInputElement).value); }} />
          </Field>
          <p class="text-[12px] text-[var(--color-text-muted)]">Search sends typed address text to Nominatim, a third party. Changing Address search reloads Polterware Notes; unsaved place edits may be lost.</p>
          <Button variant="secondary" disabled={addressBusy() || !address().trim()} onClick={() => void findAddress()}>{addressBusy() ? "Searching address" : "Search address"}</Button>
          <For each={addressHits()}>{hit => <Button variant="secondary" onClick={() => { patch({ name: hit.name, lat: String(hit.lat), lng: String(hit.lng) }); setAddressHits([]); }}>Use {hit.name}</Button>}</For>
          <Show when={addressError()}><p role="alert" class="text-[13px] text-[var(--color-text-secondary)]">{addressError()}</p></Show>
        </Show>
        <Field label="Name" for="place-name">
          <Input id="place-name" value={draft().name} onInput={(event: Event) => patch({ name: (event.currentTarget as HTMLInputElement).value })} placeholder="Optional place name" />
        </Field>
        <div class="grid grid-cols-2 gap-2">
          <Field label="Latitude" for="place-lat" error={draft().lat !== "" && lat() === undefined ? "Invalid latitude" : undefined}>
            <Input id="place-lat" inputMode="decimal" value={draft().lat} onInput={(event: Event) => patch({ lat: (event.currentTarget as HTMLInputElement).value })} placeholder="-23.5505" />
          </Field>
          <Field label="Longitude" for="place-lng" error={draft().lng !== "" && lng() === undefined ? "Invalid longitude" : undefined}>
            <Input id="place-lng" inputMode="decimal" value={draft().lng} onInput={(event: Event) => patch({ lng: (event.currentTarget as HTMLInputElement).value })} placeholder="-46.6333" />
          </Field>
        </div>
        <Slider
          label={`Radius ${draft().radiusM} m`}
          min={MIN_RADIUS_M}
          max={MAX_RADIUS_M}
          step={25}
          value={[draft().radiusM]}
          onValueChange={(details: { value: number[] }) => patch({ radiusM: clampRadius(details.value[0] ?? DEFAULT_RADIUS_M) })}
        />
        <div class="flex flex-col gap-1">
          <p class="text-[12px] text-[var(--color-text-muted)]">Enter / exit (stored for later; not armed)</p>
          <SegmentedControl
            aria-label="Stored place event"
            value={draft().event}
            onValueChange={(details: { value: string | null }) => { if (details.value === "enter" || details.value === "exit") patch({ event: details.value }); }}
            options={[{ value: "enter", label: "Enter" }, { value: "exit", label: "Exit" }]}
          />
        </div>
        <Show when={formError()}><p role="alert" class="text-[13px] text-[var(--color-text-secondary)]">{formError()}</p></Show>
        <Show when={coreError()}><p role="alert" class="text-[13px] text-[var(--color-text-secondary)]">{coreError()}</p></Show>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={Boolean(busy())} onClick={dropPin}>Drop pin</Button>
          <Button variant="primary" disabled={Boolean(busy()) || !pinReady()} onClick={() => void save()}>{busy() === "save" ? "Saving" : "Save place"}</Button>
          <Show when={saved()}>
            <Button variant="danger" disabled={Boolean(busy())} onClick={() => void clearPlace()}>{busy() === "clear" ? "Clearing" : "Clear place"}</Button>
          </Show>
        </div>
      </Show>
    </section>
  );
}
