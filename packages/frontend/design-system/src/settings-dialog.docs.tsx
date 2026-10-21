import { createSignal } from "solid-js";
import { Button } from "./button";
import type { DocEntry } from "./docs/types";
import { SettingsDialog, SettingsRow, SettingsSection } from "./settings-dialog";
import { Switch } from "./switch";

function SettingsExample() {
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal("general");
  return (
    // #region default
    <><Button onClick={() => setOpen(true)}>Open settings</Button><SettingsDialog open={open()} onClose={() => setOpen(false)} active={active()} onSelect={setActive} items={[{ id: "general", label: "General", group: "Project" }, { id: "access", label: "Access", group: "Agents" }]}><SettingsSection title="Appearance" description="Shared project preferences."><SettingsRow label="Compact density" description="Use denser lists."><Switch aria-label="Compact density" checked={false} onCheckedChange={() => undefined} /></SettingsRow></SettingsSection></SettingsDialog></>
    // #endregion
  );
}

function StackedSection() {
  return (
    // #region stack
    <SettingsSection title="Independent settings" variant="stack"><SettingsRow label="Notifications" description="Each row gets its own card."><Switch aria-label="Notifications" checked={false} onCheckedChange={() => undefined} /></SettingsRow></SettingsSection>
    // #endregion
  );
}

export default {
  name: "Settings dialog",
  group: "Overlays",
  summary: "Shared settings dialog with a searchable grouped rail and an opaque active panel. SettingsSection organizes titled groups, while SettingsRow keeps each label and control aligned.",
  exports: ["SettingsDialog", "SettingsRow", "SettingsSection"],
  examples: [{ id: "default", title: "Default", render: () => <SettingsExample /> }, { id: "stack", title: "Stacked section", render: () => <StackedSection /> }],
} satisfies DocEntry;
