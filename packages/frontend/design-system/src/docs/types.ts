import type { JSX } from "solid-js";

export type DocGroup =
  | "Buttons"
  | "Inputs"
  | "Menus"
  | "Overlays"
  | "Feedback"
  | "Data"
  | "Layout"
  | "Pages"
  | "Icons";

export interface DocExample {
  /** Matches the `#region <id>` markers around this example's JSX in the docs file. */
  id: string;
  title: string;
  description?: string;
  render: () => JSX.Element;
  /** Let the preview use the full page width instead of wrapping inline. */
  wide?: boolean;
}

/**
 * One documentation page. Lives next to the component as `<component>.docs.tsx` and is
 * discovered by the gallery; `exports` lists the index.ts names the page covers.
 */
export interface DocEntry {
  name: string;
  group: DocGroup;
  summary: string;
  exports: readonly string[];
  examples: readonly DocExample[];
}
