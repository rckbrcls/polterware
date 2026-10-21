import { Show, createSignal, onMount, type JSX } from "solid-js";
import { chromeStopsFromTint, chromeVariant, chromeVariantIndex, hashSeed, parseComputedColor, renderChromeFinish, type ChromePreset, type ChromeStop } from "./chrome-finish";
import "./icon-tile.css";

export type IconTileTone =
  | "neutral"
  | "architecture"
  | "infrastructure"
  | "data"
  | "execution"
  | "knowledge"
  | "identity"
  | "security"
  | "integration"
  | "observability";

export type IconTileSize = 16 | 20 | 24 | 28 | 36;

export const AURORA_PALETTES = ["dusk", "ember", "ocean", "meadow", "orchid", "sand"] as const;
export type AuroraPalette = (typeof AURORA_PALETTES)[number];

export const AURORA_ACCENTS: Record<AuroraPalette, string> = {
  dusk: "#A7B5ED",
  ember: "#F1BC83",
  ocean: "#8AD4CA",
  meadow: "#B9D991",
  orchid: "#B5A1E4",
  sand: "#E9D5A5",
};

/** Stable FNV-1a mapping over the ID's UTF-16 code units. */
export function auroraForId(id: string): AuroraPalette {
  return AURORA_PALETTES[hashSeed(id) % AURORA_PALETTES.length]!;
}

export function resolveAuroraAccent(palette?: AuroraPalette | string): string {
  if (!palette) return AURORA_ACCENTS.dusk;
  if (Object.hasOwn(AURORA_ACCENTS, palette)) return AURORA_ACCENTS[palette as AuroraPalette];
  return palette;
}

export type AuroraCoverProps = {
  palette?: AuroraPalette;
  accent?: string;
  class?: string;
  chromeStops?: readonly ChromeStop[];
  chromePreset?: ChromePreset;
  /** Seeds the procedural finish; the same seed draws the same reflection. Random when omitted. */
  seed?: string;
};

/** Decorative cover strip using the shared chrome finish material. */
export function AuroraCover(props: AuroraCoverProps) {
  const accent = () => props.accent ?? resolveAuroraAccent(props.palette);
  const [chrome, setChrome] = createSignal<HTMLCanvasElement>();
  let cover!: HTMLDivElement;

  onMount(() => {
    const style = getComputedStyle(cover);
    const tint = parseComputedColor(style.color);
    const variant = chromeVariant(chromeVariantIndex(props.seed), props.chromePreset);
    const stops = props.chromeStops ?? (tint ? chromeStopsFromTint(tint, variant.horizon) : undefined);
    if (!stops) return;
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const finish = renderChromeFinish(
      { width: 512 * dpr, height: 160 * dpr },
      dpr,
      {
        ...variant.options,
        stops,
        radius: 0,
        rounding: 0,
      },
    );
    if (finish) setChrome(finish);
  });

  return (
    <div
      ref={cover}
      class={`pw-aurora-cover ${props.class ?? ""}`}
      style={{ color: accent() }}
      aria-hidden="true"
    >
      <Show when={chrome()}>
        {(finish) => (
          <canvas
            class="pw-aurora-cover-finish"
            width={finish().width}
            height={finish().height}
            ref={(canvas) => queueMicrotask(() => canvas.getContext("2d")?.drawImage(finish(), 0, 0))}
          />
        )}
      </Show>
    </div>
  );
}

export type IconTileProps = {
  children: JSX.Element;
  size?: IconTileSize;
  tone?: IconTileTone;
  brand?: string | readonly string[];
  accent?: string;
  dimmed?: boolean;
  class?: string;
  /** Aurora palette; renders the chrome finish tinted with the per-id accent. */
  aurora?: AuroraPalette;
  /** Chrome gradient stops; derived from the accent when omitted. */
  chromeStops?: readonly ChromeStop[];
  /** Chrome reflection preset; `horizon` by default. */
  chromePreset?: ChromePreset;
  /** Seeds the procedural finish (for example an entity id); the same seed draws the same reflection. Random when omitted. */
  seed?: string;
};

/**
 * Light pastel accents only — the chrome finish sits behind a dark mark.
 * Keep brand hue, raise luminance; never use dark brand hexes here.
 */
export const ICON_TILE_BRAND_ACCENTS = {
  auth0: "#F29A7A",
  aws: "#FFB84D",
  azure: "#6BB3F0",
  bigquery: "#8FB8F8",
  clerk: "#A994FF",
  cloudflare: "#F5A85A",
  datadog: "#B08FD9",
  digitalocean: "#66B3FF",
  docker: "#6BB8F5",
  elasticsearch: "#6EB8C9",
  gcp: "#7EB3F5",
  github: "#EDEDED",
  github_actions: "#6BB3FF",
  gitlab: "#F5A06A",
  grafana: "#F5A05A",
  graphql: "#F08CC8",
  kafka: "#C8C8C8",
  kubernetes: "#7EA8F0",
  lambda: "#FFB84D",
  mongodb: "#7EC98A",
  mysql: "#7EAFD0",
  nextjs: "#EDEDED",
  nginx: "#6EC99A",
  openai: "#6EC9B0",
  postgres: "#7EA8C9",
  prisma: "#B8C4D0",
  prometheus: "#F08A6A",
  rabbitmq: "#FF9966",
  redis: "#F08A80",
  s3: "#8EC97A",
  snowflake: "#6EC8F0",
  sqs: "#FF8FB8",
  stripe: "#A99CFF",
  supabase: "#6ED9A8",
  terraform: "#B08FD9",
  vercel: "#EDEDED",
} as const;

const ICON_TILE_TONE_ACCENTS = {
  neutral: "var(--color-icon-tile-accent-neutral)",
  architecture: "var(--color-chart-blue)",
  infrastructure: "var(--color-chart-cyan)",
  data: "var(--color-chart-green)",
  execution: "var(--color-chart-blue)",
  knowledge: "var(--color-chart-amber)",
  identity: "var(--color-chart-cyan)",
  security: "var(--color-chart-amber)",
  integration: "var(--color-chart-blue)",
  observability: "var(--color-chart-green)",
} satisfies Record<IconTileTone, string>;

const BRAND_ALIASES = {
  amazon_web_services: "aws",
  githubactions: "github_actions",
  google_cloud: "gcp",
  google_cloud_platform: "gcp",
  next_js: "nextjs",
  postgresql: "postgres",
} satisfies Record<string, keyof typeof ICON_TILE_BRAND_ACCENTS>;

const accentRegistry: Record<string, string> = { ...ICON_TILE_BRAND_ACCENTS };

/** Register app accents before rendering. Returns cleanup for isolated previews/tests. */
export function registerIconTileAccents(accents: Readonly<Record<string, string>>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [name, color] of Object.entries(accents)) {
    const key = normalizeBrandCandidate(name);
    if (!key) continue;
    previous.set(key, accentRegistry[key]);
    accentRegistry[key] = color;
  }
  return () => {
    for (const [key, color] of previous) {
      if (color === undefined) delete accentRegistry[key];
      else accentRegistry[key] = color;
    }
  };
}

function normalizeBrandCandidate(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasOwnKey<T extends {}>(value: T, key: PropertyKey): key is keyof T {
  return Object.hasOwn(value, key);
}

function isBrandList(value: string | readonly string[]): value is readonly string[] {
  return Array.isArray(value);
}

function resolveBrandAccent(candidate: string): string | undefined {
  const normalized = normalizeBrandCandidate(candidate);
  if (!normalized) return undefined;

  if (hasOwnKey(BRAND_ALIASES, normalized)) {
    return accentRegistry[BRAND_ALIASES[normalized]];
  }

  if (hasOwnKey(accentRegistry, normalized)) {
    return accentRegistry[normalized];
  }

  const bounded = `_${normalized}_`;
  const key = Object.keys(accentRegistry).sort((a, b) => b.length - a.length).find((brandKey) => bounded.includes(`_${brandKey}_`));
  return key && hasOwnKey(accentRegistry, key)
    ? accentRegistry[key]
    : undefined;
}

export function resolveIconTileAccent(
  brand: string | readonly string[] | undefined,
  tone: IconTileTone = "neutral",
): string {
  const candidates = brand === undefined ? [] : isBrandList(brand) ? brand : [brand];
  for (const candidate of candidates) {
    const accent = resolveBrandAccent(candidate);
    if (accent) return accent;
  }
  return ICON_TILE_TONE_ACCENTS[tone];
}

export function IconTile(props: IconTileProps) {
  const size = () => props.size ?? 24;
  const accent = () =>
    props.dimmed
      ? "var(--color-icon-tile-accent-neutral)"
      : props.accent ?? (props.aurora ? resolveAuroraAccent(props.aurora) : resolveIconTileAccent(props.brand, props.tone));
  const [chrome, setChrome] = createSignal<HTMLCanvasElement>();
  let tile!: HTMLSpanElement;

  // Static chrome finish: rendered once on the client from the tile's computed accent and radius,
  // with a procedural reflection picked by the seed. Until then (SSR, first paint, no WebGL2)
  // the tile shows its flat accent tint.
  onMount(() => {
    const style = getComputedStyle(tile);
    const tint = parseComputedColor(style.color);
    const variant = chromeVariant(chromeVariantIndex(props.seed), props.chromePreset);
    const stops = props.chromeStops ?? (tint ? chromeStopsFromTint(tint, variant.horizon) : undefined);
    if (!stops) return;
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const finish = renderChromeFinish(size() * dpr, dpr, { ...variant.options, stops, radius: Number.parseFloat(style.borderTopLeftRadius) || 8 });
    if (finish) setChrome(finish);
  });

  return (
    <span
      ref={tile}
      data-icon-tile
      data-size={size()}
      data-aurora={props.aurora}
      class={`pw-icon-tile ${props.dimmed ? "pw-icon-tile--dimmed" : ""} ${props.class ?? ""}`}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        color: accent(),
      }}
      aria-hidden="true"
    >
      <Show when={chrome()}>
        {(finish) => (
          <canvas
            class="pw-icon-tile-finish"
            width={finish().width}
            height={finish().height}
            ref={(canvas) => queueMicrotask(() => canvas.getContext("2d")?.drawImage(finish(), 0, 0))}
          />
        )}
      </Show>
      <span class="pw-icon-tile-mark">{props.children}</span>
    </span>
  );
}
