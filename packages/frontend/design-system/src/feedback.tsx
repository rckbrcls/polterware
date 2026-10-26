import type { JSX } from "solid-js";
import { Button } from "./button";
import { EmptyBot, type EmptyBotMood } from "./empty-bot";
import { PageSkeleton, type PageSkeletonLayout } from "./skeleton";

export function PageLoading(props: { label?: string; layout?: PageSkeletonLayout }) {
  return <PageSkeleton layout={props.layout ?? "page"} label={props.label} />;
}

export function PageEmpty(props: {
  title?: string;
  action?: JSX.Element;
  children?: JSX.Element;
  illustration?: JSX.Element;
  /** Bot avatar mood; defaults to sleeping. Ignored when `illustration` is set. */
  mood?: EmptyBotMood;
}) {
  return (
    <div class="flex h-full min-h-[200px] w-full p-8">
      <div class="m-auto flex flex-col items-center gap-2 text-center">
        {props.illustration ?? <EmptyBot mood={props.mood} />}
        {props.title ? (
          <p class="mt-2 text-[18px] font-semibold leading-tight text-[var(--color-text-primary)]">{props.title}</p>
        ) : null}
        {props.action ? <div class="mt-2">{props.action}</div> : null}
        {props.children ? <div class="mt-4 w-full max-w-3xl">{props.children}</div> : null}
      </div>
    </div>
  );
}

export function PageError(props: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div class="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
      <p class="text-[14px] font-medium text-[var(--color-text-primary)]">{props.title ?? "Something went wrong"}</p>
      <p class="max-w-md text-[13px] text-[var(--color-text-muted)]">{props.message}</p>
      {props.onRetry ? (
        <Button variant="secondary" size="sm" onClick={() => props.onRetry?.()}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Formerly demo/fixture honesty banner.
 * Always hidden — quiet product UI; keep export so call sites stay valid.
 */
export function FixtureBanner(_props: {
  class?: string;
  visible?: boolean;
  message?: string;
  icon?: JSX.Element;
}) {
  return null;
}

export function PageOffline(props: {
  title?: string;
  message?: string;
  icon?: JSX.Element;
  onRetry?: () => void;
}) {
  return (
    <div class="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center" role="status">
      <p class="text-[20px] text-[var(--color-text-muted)]" aria-hidden>
        {props.icon ?? "○"}
      </p>
      <p class="text-[14px] font-medium text-[var(--color-text-primary)]">
        {props.title ?? "Local core offline"}
      </p>
      <p class="max-w-md text-[13px] text-[var(--color-text-muted)]">
        {props.message ?? "Polter cannot reach the local backend. Cached data may be displayed."}
      </p>
      {props.onRetry ? (
        <Button variant="secondary" size="sm" onClick={() => props.onRetry?.()}>
          Retry connection
        </Button>
      ) : null}
    </div>
  );
}

export function PageForbidden(props: {
  title?: string;
  permission?: string;
  message?: string;
  icon?: JSX.Element;
  onRequestAccess?: () => void;
}) {
  return (
    <div class="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
      <p class="text-[20px] text-[var(--color-text-muted)]" aria-hidden>
        {props.icon ?? "◈"}
      </p>
      <p class="text-[14px] font-medium text-[var(--color-text-primary)]">
        {props.title ?? "You do not have permission"}
      </p>
      <p class="max-w-md text-[13px] text-[var(--color-text-muted)]">
        {props.message ??
          (props.permission
            ? `This action requires the \`${props.permission}\` permission.`
            : "You are not allowed to perform this action.")}
      </p>
      {props.onRequestAccess ? (
        <Button variant="secondary" size="sm" onClick={() => props.onRequestAccess?.()}>
          Request access
        </Button>
      ) : null}
    </div>
  );
}

/** Decorative empty-state artwork supplied by the app; never an extra landmark. */
export function EmptyIllustration(props: { children: JSX.Element; class?: string }) {
  return <div aria-hidden="true" class={props.class}>{props.children}</div>;
}
