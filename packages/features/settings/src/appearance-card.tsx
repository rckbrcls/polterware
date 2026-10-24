import { SwitchRow } from "@polterware/frontend-design-system";
import { createSignal, onMount } from "solid-js";
import {
  hydrateAppearancePreferences,
  persistReduceTransparency,
  readShellChromeMode,
} from "./appearance-persist";
import { SettingsRow, SettingsSection } from "./settings-section";

/**
 * App-level window chrome: frosted (macOS vibrancy) vs solid fill.
 */
export function AppearanceCard() {
  const [reduceTransparency, setReduceTransparency] = createSignal(
    readShellChromeMode() === "solid",
  );
  const [ready, setReady] = createSignal(false);

  onMount(() => {
    void hydrateAppearancePreferences().then((preferences) => {
      setReduceTransparency(preferences.reduceTransparency);
      setReady(true);
    });
  });

  return (
    <SettingsSection title="Appearance" description="Choose frosted or opaque macOS window chrome on this computer.">
      <SettingsRow
        label="Reduce transparency"
        description="On macOS, the title bar and sidebar can show a frosted glass view of windows behind Polterware. This uses a solid fill instead."
      >
        <SwitchRow
          checked={reduceTransparency()}
          disabled={!ready()}
          label={<span class="sr-only">Reduce transparency</span>}
          onCheckedChange={(checked) => {
            setReduceTransparency(checked);
            void persistReduceTransparency(checked).then((preferences) => {
              setReduceTransparency(preferences.reduceTransparency);
            });
          }}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
