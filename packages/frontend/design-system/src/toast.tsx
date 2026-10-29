import { For, Show, createSignal, type Accessor, type Setter } from "solid-js";
import { Check, InformationCircle } from "./hugeicons";
import "./toast.css";

/** One follow-up for the entity a toast names, such as Undo or View. */
export type ToastAction = { label: string; onClick: () => void };

export type ToastItem = { id: string; message: string; tone?: "default" | "danger" | "success"; action?: ToastAction };

export type ToastOptions = { action?: ToastAction };

/** A toast with an action stays long enough to reach it. */
const TOAST_MS = 3200;
const TOAST_ACTION_MS = 6000;

type ToastPhase = "visible" | "exiting";
type ToastEntry = ToastItem & {
  phase: Accessor<ToastPhase>;
  setPhase: Setter<ToastPhase>;
};

const [toasts, setToasts] = createSignal<ToastEntry[]>([]);
const dismissTimers = new Map<string, number>();
const removalTimers = new Map<string, number>();

function clearTimer(timers: Map<string, number>, id: string) {
  const timer = timers.get(id);
  if (timer === undefined) return;
  window.clearTimeout(timer);
  timers.delete(id);
}

function removeToast(id: string) {
  clearTimer(dismissTimers, id);
  clearTimer(removalTimers, id);
  setToasts((items) => items.filter((item) => item.id !== id));
}

function beginToastExit(id: string) {
  dismissTimers.delete(id);
  const toast = toasts().find((item) => item.id === id);
  if (!toast || toast.phase() === "exiting") return;

  toast.setPhase("exiting");
  const fallbackDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 120
    : 400;
  removalTimers.set(id, window.setTimeout(() => removeToast(id), fallbackDelay));
}

export function pushToast(message: string, tone: ToastItem["tone"] = "default", options: ToastOptions = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [phase, setPhase] = createSignal<ToastPhase>("visible");
  setToasts((items) => [...items, { id, message, tone, action: options.action, phase, setPhase }]);
  dismissTimers.set(id, window.setTimeout(() => beginToastExit(id), options.action ? TOAST_ACTION_MS : TOAST_MS));
}

export function ToastRegion() {
  return (
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-[var(--z-toast)] flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      <For each={toasts()}>
        {(t) => (
          <div
            class={`pw-toast-item menu-panel pointer-events-auto flex items-start gap-2 px-3 py-2 text-[13px] ${
              t.tone === "danger"
                ? "text-[var(--color-danger)]"
                : t.tone === "success"
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-primary)]"
            }`}
            data-exiting={t.phase() === "exiting" ? "" : undefined}
            onTransitionEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.propertyName === "transform" &&
                t.phase() === "exiting"
              ) {
                removeToast(t.id);
              }
            }}
          >
            <span class="mt-0.5 flex-none" aria-hidden="true">
              {t.tone === "success" ? <Check size={14} /> : <InformationCircle size={14} />}
            </span>
            <span class="min-w-0 flex-1">{t.message}</span>
            <Show when={t.action}>
              {(action) => (
                <button
                  type="button"
                  class="pw-toast-action flex-none rounded-[var(--radius-item)] px-1.5 text-[12.5px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]"
                  onClick={() => {
                    clearTimer(dismissTimers, t.id);
                    beginToastExit(t.id);
                    action().onClick();
                  }}
                >
                  {action().label}
                </button>
              )}
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
