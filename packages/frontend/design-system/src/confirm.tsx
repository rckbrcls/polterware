import { Show, createSignal } from "solid-js";
import { Button } from "./button";
import { A11yDialog } from "./dialog";

/**
 * A confirm says what the action touches (`description`) and how to get it
 * back (`recovery`). The confirm button takes focus, so Enter confirms and
 * Escape cancels.
 */
export type ConfirmOptions = {
  title: string;
  description: string;
  /** How the change can be undone, or that it cannot. */
  recovery?: string;
  confirmLabel: string;
  /** `danger` for removals; `default` for reversible moves. */
  tone?: "danger" | "default";
};

type PendingConfirm = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const [pending, setPending] = createSignal<PendingConfirm | null>(null);

/**
 * Asks for confirmation and resolves true when confirmed. A second request
 * while one is open cancels the first. Needs one `<ConfirmRegion />` mounted.
 */
export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  pending()?.resolve(false);
  return new Promise((resolve) => setPending({ ...options, resolve }));
}

function settle(confirmed: boolean) {
  const current = pending();
  if (!current) return;
  setPending(null);
  current.resolve(confirmed);
}

/** Renders the open confirm. Mount it once at the app shell, next to `ToastRegion`. */
export function ConfirmRegion() {
  let confirmButton: HTMLButtonElement | undefined;
  return (
    <A11yDialog
      open={pending() !== null}
      title={pending()?.title ?? ""}
      size="sm"
      onClose={() => settle(false)}
      initialFocus={() => confirmButton}
      footer={
        <>
          <Button size="sm" variant="texture" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button
            ref={(element: HTMLButtonElement) => { confirmButton = element; }}
            size="sm"
            variant={pending()?.tone === "default" ? "primary" : "danger"}
            onClick={() => settle(true)}
          >
            {pending()?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      <p class="m-0 text-[12.5px] text-[var(--color-text-secondary)]">{pending()?.description}</p>
      <Show when={pending()?.recovery}>
        <p class="m-0 mt-2 text-[12.5px] text-[var(--color-text-muted)]">{pending()?.recovery}</p>
      </Show>
    </A11yDialog>
  );
}
