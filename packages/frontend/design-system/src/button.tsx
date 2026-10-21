import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { Tooltip } from "./tooltip";
import "./button.css";
import "./control-button.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "brand" | "icon" | "texture";
export type ButtonTextureTone = "neutral" | "brand" | "danger" | "success" | "warn" | "info";
export type ButtonSize = "sm" | "md" | "icon";

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Marks the button as applied (for example an active filter). Styles the `texture` variant. */
  selected?: boolean;
  /** Palette of the `texture` variant; ignored by every other variant. */
  textureTone?: ButtonTextureTone;
};

const base =
  "inline-flex shrink-0 cursor-pointer items-center justify-center font-medium select-none [&_svg]:pointer-events-none [&_svg]:shrink-0";

const flat = "pw-button pw-button-flat border border-transparent bg-transparent outline-hidden transition-[background,border-color,color] duration-[var(--duration-control)] ease-[var(--ease-standard)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]";
/** Solid variants share the opaque ControlButton chrome; ghost + icon stay flat with a full-round hover. */
const control = "pw-control-button control-field control-field-md gap-1.5";

const variantClass = {
  primary: control,
  secondary: control,
  danger: control,
  brand: control,
  ghost: flat,
  icon: flat,
  /** Framed gradient face (see button.css `.pw-texture-button`); `textureTone` picks the palette. */
  texture: "pw-texture-button gap-1.5",
} satisfies Record<ButtonVariant, string>;

const tone = {
  primary: "brand",
  secondary: "secondary",
  danger: "danger",
  brand: "brand",
} as const;

const sizeClass = {
  sm: "h-[var(--control-height-sm)] gap-1.5 px-2.5 text-xs",
  md: "h-[var(--control-height-md)] gap-1.5 px-3 text-[13px]",
  icon: "pw-control-button--icon h-[var(--control-height-sm)] w-[var(--control-height-sm)] p-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
} satisfies Record<ButtonSize, string>;

function toneOf(variant: ButtonVariant = "secondary") {
  return variant === "ghost" || variant === "icon" || variant === "texture" ? undefined : tone[variant];
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Product button — ControlButton chrome for solid variants; ghost/icon flat.
 * Default is secondary (neutral). Primary is ice white (dark gray on light themes) and must be opt-in
 * for PageHeader top-right CTAs only.
 */
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "size", "selected", "textureTone", "class", "classList"]);
  const className = () => buttonClassName(local.variant, local.size, local.class);
  const button = (attrs: JSX.ButtonHTMLAttributes<HTMLButtonElement> = rest) => (
    <button type="button" {...attrs} title={autoTooltip() ? undefined : attrs.title} data-tone={toneOf(local.variant)} data-selected={local.selected ? "" : undefined} data-texture-tone={local.variant === "texture" ? (local.textureTone ?? "neutral") : undefined} class={className()} classList={local.classList} />
  );
  const isIcon = () => (local.size ?? (local.variant === "icon" ? "icon" : "md")) === "icon";
  // `title` doubles as the tooltip text; the native attribute is dropped so only our Tooltip shows.
  const label = () => {
    const value = rest.title || rest["aria-label"];
    return typeof value === "string" && value ? value : undefined;
  };
  // Icon-only buttons explain themselves on hover; skip when a caller already owns a tooltip trigger.
  const autoTooltip = () => isIcon() && label() !== undefined && (rest as Record<string, unknown>)["data-scope"] !== "tooltip";

  return (
    <Show when={autoTooltip()} fallback={button()}>
      <Tooltip.Root disabled={rest.disabled}>
        <Tooltip.Trigger asChild={(triggerProps) => button(triggerProps(rest) as JSX.ButtonHTMLAttributes<HTMLButtonElement>)} />
        <Tooltip.Content>{label()}</Tooltip.Content>
      </Tooltip.Root>
    </Show>
  );
}

/** Native link with the same materials and sizing as Button. */
export type LinkButtonProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  textureTone?: ButtonTextureTone;
};

function buttonClassName(variant: ButtonVariant = "secondary", size?: ButtonSize, className?: string) {
  const actualSize = size ?? (variant === "icon" ? "icon" : "md");
  const radius = variant === "texture"
    ? actualSize === "icon" ? "rounded-full" : actualSize === "sm" ? "rounded-[6px] [--tx-face-radius:4px]" : "rounded-[12px] [--tx-face-radius:10px]"
    : variant === "ghost" || variant === "icon" || actualSize === "icon"
      ? "rounded-full" : "rounded-[var(--radius-control)]";
  const pill = variant === "texture" && actualSize !== "icon" ? "!px-4" : undefined;
  return cn(base, variantClass[variant], sizeClass[actualSize], radius, pill, className);
}

export function LinkButton(props: LinkButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "size", "textureTone", "class", "classList"]);
  return <a {...rest} data-tone={toneOf(local.variant)} data-texture-tone={local.variant === "texture" ? (local.textureTone ?? "neutral") : undefined} class={buttonClassName(local.variant, local.size, local.class)} classList={local.classList} />;
}
