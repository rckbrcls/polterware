// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import {
  ICON_TILE_BRAND_ACCENTS,
  IconTile,
  resolveIconTileAccent,
} from "./icon-tile";

const styles = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "icon-tile.css"),
  "utf8",
);

function renderHtml(ui: Parameters<typeof render>[0]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(ui, host);
  const html = host.innerHTML;
  dispose();
  host.remove();
  return html;
}

describe("IconTile", () => {
  it("prefers the first recognized brand before the domain tone", () => {
    expect(resolveIconTileAccent(["prod-postgres", "AWS"], "infrastructure"))
      .toBe(ICON_TILE_BRAND_ACCENTS.postgres);
    expect(resolveIconTileAccent(["github-actions", "GitHub"], "integration"))
      .toBe(ICON_TILE_BRAND_ACCENTS.github_actions);
    expect(resolveIconTileAccent("unknown-service", "knowledge"))
      .toBe("var(--color-chart-amber)");
  });

  it("renders the supported sizes with a neutral centered mark", () => {
    for (const size of [20, 24, 28] as const) {
      const html = renderHtml(() => (
        <IconTile size={size} tone="architecture">
          <svg data-mark viewBox="0 0 16 16" />
        </IconTile>
      ));

      expect(html).toContain("data-icon-tile");
      expect(html).toContain(`data-size="${size}"`);
      expect(html).toContain(`width: ${size}px`);
      expect(html).toContain("pw-icon-tile-mark");
      expect(html).toContain("--color-chart-blue");
    }
  });

  it("uses the light neutral accent + dark dimmed mark tokens when dimmed", () => {
    const html = renderHtml(() => (
      <IconTile tone="infrastructure" brand="AWS" dimmed>
        <svg data-mark viewBox="0 0 16 16" />
      </IconTile>
    ));

    expect(html).toContain("pw-icon-tile--dimmed");
    expect(html).toContain("--color-icon-tile-accent-neutral");
    expect(html).not.toContain("--color-text-disabled");
    expect(html).not.toContain("opacity");
    expect(html).not.toContain("gradient");
  });

  it("keeps a light accent-tinted base under the chrome finish", () => {
    expect(styles).toContain("var(--color-icon-tile-base)");
    expect(styles).toContain("var(--color-icon-tile-edge)");
    expect(styles).toMatch(/color-mix\(\s*in srgb/);
    expect(styles).toContain("currentColor");
    expect(styles).not.toContain("--color-surface-subtle");
    expect(styles).toContain("border-radius: var(--radius-control)");
    expect(styles).not.toMatch(/\bopacity\b/);
    expect(styles).not.toMatch(/\bgradient\b/);
  });

  it("paints dark marks on light accents, never text-primary", () => {
    expect(styles).toContain("color: var(--color-icon-tile-mark)");
    expect(styles).toContain("color: var(--color-icon-tile-mark-dimmed)");
    expect(styles).not.toContain("--color-text-primary");
    expect(styles).not.toContain("--color-text-disabled");
  });

  it("uses a bolder stroke on identity-tile marks than the global 1.5 default", () => {
    expect(styles).toContain("stroke-width: var(--pw-icon-tile-stroke-width, 2.5)");
  });

  it("keeps brand accents light pastels for dark-mark contrast", () => {
    expect(ICON_TILE_BRAND_ACCENTS.postgres).toBe("#7EA8C9");
    expect(ICON_TILE_BRAND_ACCENTS.elasticsearch).toBe("#6EB8C9");
    expect(ICON_TILE_BRAND_ACCENTS.nginx).toBe("#6EC99A");
    expect(ICON_TILE_BRAND_ACCENTS.datadog).toBe("#B08FD9");
    expect(ICON_TILE_BRAND_ACCENTS.github).toBe("#EDEDED");
    expect(resolveIconTileAccent(undefined, "neutral")).toBe(
      "var(--color-icon-tile-accent-neutral)",
    );
  });
});
