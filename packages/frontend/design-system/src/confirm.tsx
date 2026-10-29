import { Show, createSignal } from "solid-js";
import { Button } from "./button";
import { A11yDialog } from "./dialog";
import { Textarea } from "./input";

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

/** A confirm that also asks why, for a change of intent such as reopening a decision. */
export type ReasonOptions = Omit<ConfirmOptions, "recovery" | "tone"> & {
  /** Hint inside the reason field. */
  placeholder?: string;
};

type PendingConfirm = ConfirmOptions & {
  reason?: { placeholder?: string };
  resolve: (answer: string | null) => void;
};

const [pending, setPending] = createSignal<PendingConfirm | null>(null);
const [reasonText, setReasonText] = createSignal("");

function ask(options: Omit<PendingConfirm, "resolve">): Promise<string | null> {
  pending()?.resolve(null);
  setReasonText("");
  return new Promise((resolve) => setPending({ ...options, resolve }));
}

/**
 * Asks for confirmation and resolves true when confirmed. A second request
 * while one is open cancels the first. Needs one `<ConfirmRegion />` mounted.
 */
export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  return ask(options).then((answer) => answer !== null);
}

/**
 * Asks why before a change of intent and resolves the trimmed reason, or null
 * when cancelled. Confirming needs a reason. Shares the `<ConfirmRegion />`.
 */
export function requestReason(options: ReasonOptions): Promise<string | null> {
  return ask({ ...options, tone: "default", reason: { placeholder: options.placeholder } });
}

function settle(confirmed: boolean) {
  const current = pending();
  if (!current) return;
  const answer = !confirmed ? null : current.reason ? reasonText().trim() : "";
  if (current.reason && answer === "") return;
  setPending(null);
  current.resolve(answer);
}

/** Renders the open confirm. Mount it once at the app shell, next to `ToastRegion`. */
export function ConfirmRegion() {
  let confirmButton: HTMLButtonElement | undefined;
  let reasonField: HTMLTextAreaElement | undefined;
  const needsReason = () => Boolean(pending()?.reason) && reasonText().trim() === "";
  return (
    <A11yDialog
      open={pending() !== null}
      title={pending()?.title ?? ""}
      size="sm"
      onClose={() => settle(false)}
      initialFocus={() => (pending()?.reason ? reasonField : confirmButton)}
      footer={
        <>
          <Button size="sm" variant="texture" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button
            ref={(element: HTMLButtonElement) => { confirmButton = element; }}
            size="sm"
            variant={pending()?.tone === "default" ? "primary" : "danger"}
            disabled={needsReason()}
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
      <Show when={pending()?.reason}>
        {(reason) => (
          <Textarea
            ref={reasonField}
            class="mt-3"
            size="sm"
            rows={3}
            aria-label="Reason"
            placeholder={reason().placeholder ?? "Why?"}
            value={reasonText()}
            onInput={(event) => setReasonText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
              event.preventDefault();
              settle(true);
            }}
          />
        )}
      </Show>
    </A11yDialog>
  );
}
