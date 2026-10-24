import { Show, createMemo } from "solid-js";
import { Button, IconTile, Kbd, Zap, pushToast } from "@polterware/frontend-design-system";
import {
  createShortcutSelector,
  formatChord,
  resolveChord,
  serializeChord,
  shortcutStore,
  type ShortcutChord,
  type ShortcutCommand,
} from "@polterware/frontend-state";
import { ShortcutRecorder } from "./shortcut-recorder";
import { persistShortcutOverrides } from "./shortcut-persist";

export function ShortcutRow(props: {
  command: ShortcutCommand;
  recordingId: string | null;
  onRecordingChange: (id: string | null) => void;
}) {
  const overrides = createShortcutSelector((state) => state.overrides);
  const currentChord = createMemo(() => resolveChord(props.command, overrides()));
  const isCustom = createMemo(() => Boolean(overrides()[props.command.id]));
  const isRecording = () => props.recordingId === props.command.id;

  async function applyChord(chord: ShortcutChord) {
    const result = shortcutStore.getState().setOverride(props.command.id, chord);
    if (!result.ok) {
      pushToast(
        `Conflicts with “${result.conflict.label}”.`,
        "danger",
      );
      props.onRecordingChange(null);
      return;
    }
    try {
      await persistShortcutOverrides(shortcutStore.getState().overrides);
      pushToast("Shortcut saved.", "success");
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Could not save shortcut.",
        "danger",
      );
    }
    props.onRecordingChange(null);
  }

  async function restoreDefault() {
    shortcutStore.getState().clearOverride(props.command.id);
    try {
      await persistShortcutOverrides(shortcutStore.getState().overrides);
      pushToast("Default shortcut restored.", "success");
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Could not restore shortcut.",
        "danger",
      );
    }
  }

  return (
    <div class="flex items-center gap-3">
      <IconTile size={24} seed={props.command.id} class="shrink-0">
        <Zap size={14} />
      </IconTile>
      <div class="min-w-0 flex-1">
        <p class="m-0 text-[12.5px] text-[var(--color-text-primary)]">{props.command.label}</p>
        <Show when={isCustom()}>
          <p class="m-0 mt-0.5 text-[11px] text-[var(--color-text-muted)]">
            Default {formatChord(props.command.defaultChord)}
          </p>
        </Show>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Show
          when={isRecording()}
          fallback={
            <Kbd class="min-w-[4.5rem] justify-center text-center">
              {formatChord(currentChord())}
            </Kbd>
          }
        >
          <span class="min-w-[4.5rem] text-center text-[11px] text-[var(--color-text-muted)]">
            Press keys…
          </span>
        </Show>
        <Show when={isRecording()}>
          <ShortcutRecorder
            active
            onCapture={(chord) => {
              void applyChord(chord);
            }}
            onCancel={() => props.onRecordingChange(null)}
          />
          <Button size="sm" variant="ghost" onClick={() => props.onRecordingChange(null)}>
            Cancel
          </Button>
        </Show>
        <Show when={!isRecording()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => props.onRecordingChange(props.command.id)}
          >
            Edit
          </Button>
          <Show when={isCustom()}>
            <Button size="sm" variant="ghost" onClick={() => void restoreDefault()}>
              Reset
            </Button>
          </Show>
        </Show>
      </div>
      <span class="sr-only">{serializeChord(currentChord())}</span>
    </div>
  );
}
