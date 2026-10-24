import { SettingsSection } from "./settings-section";

/**
 * Local-first privacy note for Settings → Advanced.
 * Trust copy only — not a terms-of-service document.
 */
export function PrivacyCard() {
  return (
    <SettingsSection title="Privacy">
      <p class="m-0 text-[12px] text-[var(--color-text-muted)]">
        Polterware runs as a local Desktop on your machine. There is no account
        sign-in and no hosted workspace for day-to-day use.
      </p>
      <p class="m-0 text-[12px] text-[var(--color-text-muted)]">
        Project data stays on this device. Provider credentials used through
        Integrations remain in the OS or CLI credential store — Polterware does
        not store provider tokens in the app database.
      </p>
    </SettingsSection>
  );
}
