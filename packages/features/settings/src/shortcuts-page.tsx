import { For, createSignal } from "solid-js";
import {
  SHORTCUT_GROUPS,
  SHORTCUT_GROUP_LABELS,
  shortcutsInGroup,
} from "@polterware/frontend-state";
import { SettingsSection } from "./settings-section";
import { ShortcutRow } from "./shortcut-row";

/** Editable keyboard shortcuts, by group. */
export function ShortcutsPage() {
  const [recordingId, setRecordingId] = createSignal<string | null>(null);

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection
        title="Shortcuts"
        description="Shortcuts apply on this computer. Single-key shortcuts such as [ and N never fire while you type in a field. ⌘/ lists every shortcut, including the fixed G sequences. Escape cancels recording and stays reserved for dialogs."
      >
        <For each={SHORTCUT_GROUPS}>
          {(group) => (
            <div class="flex flex-col gap-4">
              <h4 class="m-0 text-[12px] font-medium text-[var(--color-text-muted)]">{SHORTCUT_GROUP_LABELS[group]}</h4>
              <For each={shortcutsInGroup(group)}>
                {(command) => (
                  <ShortcutRow
                    command={command}
                    recordingId={recordingId()}
                    onRecordingChange={setRecordingId}
                  />
                )}
              </For>
            </div>
          )}
        </For>
      </SettingsSection>
    </div>
  );
}
