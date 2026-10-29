import type { ArchNode, Relationship } from "@polterware/frontend-canvas";
import { properties, withProperties } from "./types/shared";

// Persist a semantic tag, never a user-supplied CSS color.
export const colorTags = ["neutral", "yellow", "blue", "green", "red"] as const;
export type ColorTag = (typeof colorTags)[number];
export function colorToken(value: unknown): string {
  const tokens: Record<string, string> = { yellow: "var(--color-warning)", blue: "var(--color-info)", green: "var(--color-brand)", red: "var(--color-danger)" };
  return Object.hasOwn(tokens, String(value)) ? tokens[String(value)]! : "var(--color-text-muted)";
}
const fills: Record<string, { fill: string; text: string }> = {
  neutral: { fill: "var(--color-surface-subtle)", text: "var(--color-text-primary)" },
  yellow: { fill: "var(--color-status-warning-background)", text: "var(--color-status-warning-foreground)" },
  blue: { fill: "var(--color-status-info-background)", text: "var(--color-status-info-foreground)" },
  green: { fill: "var(--color-status-success-background)", text: "var(--color-status-success-foreground)" },
  red: { fill: "var(--color-status-danger-background)", text: "var(--color-status-danger-foreground)" },
};
export function fillToken(tag: string) { return tag === "none" ? "none" : (fills[tag] ?? fills.neutral!).fill; }
export function fillTextToken(tag: string) { return tag === "none" ? "var(--color-text-primary)" : (fills[tag] ?? fills.neutral!).text; }
export function strokeToken(tag: string) { return tag === "none" ? "none" : tag === "neutral" ? "var(--color-text-muted)" : colorToken(tag); }

export type ShapeStyle = {
  fill: string; stroke: string; strokeWidth: 1 | 2 | 3; dashed: boolean;
  textSize: "sm" | "md" | "lg"; textAlign: "left" | "center" | "right"; bold: boolean;
};
export const defaultStyle: ShapeStyle = { fill: "neutral", stroke: "neutral", strokeWidth: 1, dashed: false, textSize: "md", textAlign: "center", bold: false };
const oneOf = <T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;

/** Presentation lives under props.style; the core keeps it out of agent exports. */
export function readStyle(item: Pick<ArchNode | Relationship, "metadata">): ShapeStyle {
  const raw = properties(item).style;
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    fill: oneOf(value.fill, [...colorTags, "none"], defaultStyle.fill),
    stroke: oneOf(value.stroke, [...colorTags, "none"], defaultStyle.stroke),
    strokeWidth: oneOf(value.strokeWidth, [1, 2, 3] as const, defaultStyle.strokeWidth),
    dashed: value.dashed === true,
    textSize: oneOf(value.textSize, ["sm", "md", "lg"] as const, defaultStyle.textSize),
    textAlign: oneOf(value.textAlign, ["left", "center", "right"] as const, defaultStyle.textAlign),
    bold: value.bold === true,
  };
}
export function withStyle<T extends Pick<ArchNode | Relationship, "metadata">>(item: T, patch: Partial<ShapeStyle>): T {
  const props = properties(item);
  return withProperties(item, { ...props, style: { ...readStyle(item), ...patch } });
}
export function textClass(style: ShapeStyle) {
  return `${style.textSize === "sm" ? "text-xs" : style.textSize === "lg" ? "text-base" : "text-sm"} ${style.bold ? "font-semibold" : ""} ${style.textAlign === "left" ? "text-left" : style.textAlign === "right" ? "text-right" : "text-center"}`;
}
