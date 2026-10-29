/**
 * Chromatic metal finish for small tiles (WebGL2 port of the Figma "Chromatic metal" shader).
 *
 * The effect is static, so each variant (size, gradient, params) renders once on one shared
 * WebGL2 canvas and is cached as a 2D canvas that tiles copy with drawImage. The two Gaussian
 * blur passes of the original are replaced by the analytic blur of a rounded-rect distance field.
 */

export type ChromeStop = { position: number; color: readonly [number, number, number] };

export type ChromeFinishOptions = {
  /** Gradient stops (0–1 positions, 0–1 linear sRGB channels); at most 8. */
  stops: readonly ChromeStop[];
  /** Rounding blur as a fraction of the tile size. */
  rounding?: number;
  /** Relief depth, 1 = Figma's 100%. */
  depth?: number;
  /** RGB split, Figma percent (10 by default). */
  split?: number;
  /** Noise angle in degrees. */
  angle?: number;
  /** Gradient repeats across the height range. */
  repeats?: number;
  /** Noise phase (-1..1) to vary tiles that share a gradient. */
  phase?: number;
  /** Corner radius in CSS pixels. */
  radius?: number;
  /** 0 = organic noise blob (Figma original), 1 = straight horizon bands along `angle`. */
  linear?: number;
  /** How much the noise bends the horizon bands. */
  warp?: number;
  /** Chromatic film grain strength (0–1). */
  grain?: number;
  /** Height jitter before the gradient lookup. 1 matches Figma roughness at 100%. */
  roughness?: number;
  /** Reflection geometry. Every family shares the hard metal ramp, roughness, and grain. */
  reflection?: "horizon" | "satin" | "radial" | "liquid" | "folded";
};

type Rgb = readonly [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Hard silver ramp from the Figma chromatic metal gradient.
 * Highlights stay near white. The accent tints the mid band and, lightly, the dark valley.
 * `horizon` and `smooth` stay in the signature for existing callers.
 */
export function chromeStopsFromTint(tint: Rgb, horizon = 0.5, smooth = false): ChromeStop[] {
  void horizon;
  void smooth;
  const white = mix(tint, [1, 1, 1], 0.82);
  const mid = mix([0.278, 0.302, 0.329], tint, 0.55);
  const dark = mix([0.247, 0.247, 0.251], tint, 0.22);
  return [
    { position: 0.18, color: white },
    { position: 0.43, color: mid },
    { position: 0.43, color: white },
    { position: 0.55, color: white },
    { position: 0.55, color: dark },
    { position: 0.7, color: dark },
    { position: 0.7, color: white },
  ];
}

/** Lowest mean channel for a chrome mark tint; darker accents would vanish on the dark tile face. */
export const CHROME_MARK_TINT_FLOOR = 0.55;

/**
 * Saturated ramp for a chrome mark on the dark lit tile, same band layout as `chromeStopsFromTint`.
 * Dark accents are first lifted toward white to the floor. The accent is then pushed away from grey;
 * the body carries the hue, highlights lift toward white, and the valley deepens the hue instead of
 * going grey, so thin strokes still read as color.
 */
export function chromeMarkStopsFromTint(input: Rgb): ChromeStop[] {
  const inputMean = (input[0] + input[1] + input[2]) / 3;
  const tint = inputMean < CHROME_MARK_TINT_FLOOR ? mix(input, [1, 1, 1], (CHROME_MARK_TINT_FLOOR - inputMean) / (1 - inputMean)) : input;
  const mean = (tint[0] + tint[1] + tint[2]) / 3;
  const vivid = tint.map((channel) => Math.min(1, Math.max(0, mean + (channel - mean) * 1.8))) as unknown as Rgb;
  const light = mix(vivid, [1, 1, 1], 0.45);
  const deep = mix(vivid, [0.12, 0.12, 0.13], 0.4);
  return [
    { position: 0.18, color: light },
    { position: 0.43, color: vivid },
    { position: 0.43, color: light },
    { position: 0.55, color: light },
    { position: 0.55, color: deep },
    { position: 0.7, color: deep },
    { position: 0.7, color: vivid },
  ];
}

/** Named reflections. Procedural seeds stay on horizon, the Figma organic field. */
export const CHROME_PRESETS = {
  horizon: { reflection: "horizon", repeats: 2, warp: 0.3, linear: 0, angle: 30, roughness: 0.6, grain: 0.2 },
  subtle: { reflection: "horizon", repeats: 1, warp: 0.15, angle: -35 },
  satin: { reflection: "satin", repeats: 1, warp: 0.12 },
  radial: { reflection: "radial", repeats: 1, warp: 0.2 },
  liquid: { reflection: "liquid", repeats: 1, warp: 0.65 },
  folded: { reflection: "folded", repeats: 1, warp: 0.25 },
} satisfies Record<string, Partial<ChromeFinishOptions>>;

export type ChromePreset = keyof typeof CHROME_PRESETS;

const PROCEDURAL_PRESETS = ["horizon"] as const;
const REFLECTION_MODES = { horizon: 0, satin: 1, radial: 2, liquid: 3, folded: 4 } as const;

/** Procedural finishes per preset. Seeds fold into this many, so the render cache stays bounded. */
export const CHROME_VARIANTS = 64;

/** Stable FNV-1a hash over the string's UTF-16 code units. */
export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

/** Variant index for a seed; a random one when the seed is omitted. */
export function chromeVariantIndex(seed?: string): number {
  return seed === undefined ? Math.floor(Math.random() * CHROME_VARIANTS) : hashSeed(seed) % CHROME_VARIANTS;
}

/**
 * Seeds vary angle, phase, and split on the horizon metal. An explicit preset pins the family.
 */
export function chromeVariant(index: number, preset?: ChromePreset): { options: Partial<ChromeFinishOptions>; horizon: number; smooth: boolean } {
  const variantIndex = ((Math.trunc(index) % CHROME_VARIANTS) + CHROME_VARIANTS) % CHROME_VARIANTS;
  // mulberry32: a few well-spread numbers from a small integer.
  let state = Math.imul(variantIndex + 1, 0x9e3779b9);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const base: Partial<ChromeFinishOptions> = CHROME_PRESETS[preset ?? PROCEDURAL_PRESETS[variantIndex % PROCEDURAL_PRESETS.length]!];
  const between = (min: number, max: number) => min + (max - min) * next();
  return {
    options: {
      ...base,
      angle: (base.angle ?? 30) + between(-26, 26),
      warp: (base.warp ?? 0.3) * between(0.5, 1.6),
      phase: between(-1, 1),
      split: between(6, 16),
    },
    horizon: between(0.38, 0.62),
    smooth: base.reflection !== "horizon",
  };
}

/** Parses a computed `rgb` or `color(srgb …)` string into 0–1 channels. */
export function parseComputedColor(value: string): Rgb | undefined {
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])];
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  return undefined;
}

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uSize;
uniform float uRadius;
uniform float uSigma;
uniform vec4 uColors[8];
uniform float uPos[8];
uniform int uCount;
uniform float uDepth;
uniform float uSplit;
uniform float uAngle;
uniform float uRepeats;
uniform float uPhase;
uniform float uLinear;
uniform float uWarp;
uniform float uGrain;
uniform float uRoughness;
uniform int uReflection;

const float TILE_PERIOD = 8.0;
const float NOISE_SCALE = 0.5;
const float STRETCH = 2.0;

vec4 ramp(float t) {
  if (uCount <= 1 || t <= uPos[0]) return uColors[0];
  int last = uCount - 1;
  if (t >= uPos[last]) return uColors[last];
  for (int i = 0; i < 7; i++) {
    if (i >= last) break;
    if (t <= uPos[i + 1]) {
      float blend = (t - uPos[i]) / max(uPos[i + 1] - uPos[i], 1e-5);
      return mix(uColors[i], uColors[i + 1], blend);
    }
  }
  return uColors[last];
}

vec4 aaLookup(float rawH) {
  float tw = fract(rawH);
  float fw = max(fwidth(rawH), 1e-5);
  float blend = clamp(min(tw, 1.0 - tw) / (fw * 1.5), 0.0, 1.0);
  float other = tw > 0.5 ? tw - 1.0 : tw + 1.0;
  return mix(ramp(clamp(other, 0.0, 1.0)), ramp(tw), blend);
}

float hash3(vec3 p) {
  vec3 q = fract(p * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}

float wrapT(float v) { return v - floor(v / TILE_PERIOD) * TILE_PERIOD; }

float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 s = f * f * (3.0 - 2.0 * f);
  float x0 = wrapT(i.x), x1 = wrapT(i.x + 1.0), z0 = wrapT(i.z), z1 = wrapT(i.z + 1.0);
  float y0 = i.y, y1 = i.y + 1.0;
  return mix(
    mix(mix(hash3(vec3(x0, y0, z0)), hash3(vec3(x1, y0, z0)), s.x), mix(hash3(vec3(x0, y1, z0)), hash3(vec3(x1, y1, z0)), s.x), s.y),
    mix(mix(hash3(vec3(x0, y0, z1)), hash3(vec3(x1, y0, z1)), s.x), mix(hash3(vec3(x0, y1, z1)), hash3(vec3(x1, y1, z1)), s.x), s.y),
    s.z);
}

float heightAt(vec3 np, float em, float eps, vec2 p) {
  float n = noise3(np);
  float rim = (1.0 - em) * 0.12 * uDepth;
  // Continuous reflection fields: no dark horizon seam in these families.
  if (uReflection == 1) {
    return 0.5 + 0.38 * sin((p.y + uPhase * 0.3) * 4.2 + (n - 0.5) * uWarp) + rim;
  }
  if (uReflection == 2) {
    vec2 center = vec2(0.5 + uPhase * 0.3, 0.42 - uPhase * 0.2);
    float d = length((p - center) * vec2(1.0, 1.35));
    return 0.12 + 0.76 * exp(-d * d * 3.8) + (n - 0.5) * uWarp + rim;
  }
  if (uReflection == 3) {
    float wave = sin(p.x * 5.0 + uPhase * 2.0 + n * uWarp * 5.0)
      + cos(p.y * 4.0 - p.x * 2.5 + n * uWarp * 4.0);
    return 0.5 + wave * 0.21 + rim;
  }
  if (uReflection == 4) {
    float fold = p.y * 7.0 + sin(p.x * 4.5 + uPhase * 2.0) * (0.7 + uWarp);
    return 0.5 + 0.36 * cos(fold) + (n - 0.5) * 0.08 + rim;
  }
  float dx = noise3(np + vec3(eps, 0.0, 0.0)) - noise3(np - vec3(eps, 0.0, 0.0));
  float dy = noise3(np + vec3(0.0, eps, 0.0)) - noise3(np - vec3(0.0, eps, 0.0));
  float organic = mix(0.5, n * em, uDepth) + (dx + dy) * 0.5 * uDepth * 0.3;
  // Horizon reflection: a straight ramp across the rotated tile, bent by the noise and lifted at the rim.
  float horizon = p.y + (n - 0.5) * uWarp + rim;
  return mix(organic, horizon, uLinear);
}

// Gaussian-blurred alpha of the rounded tile: logistic approximation of the normal CDF.
float edgeMask(vec2 px) {
  vec2 hs = uSize * 0.5;
  vec2 q = abs(px - hs) - (hs - vec2(uRadius));
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  return 1.0 / (1.0 + exp(1.702 * d / max(uSigma, 0.001)));
}

void main() {
  float a = radians(uAngle);
  vec2 c = vUv - 0.5;
  vec2 r = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a)) + 0.5;
  float em = edgeMask(vUv * uSize);
  vec3 base = vec3(r.x / NOISE_SCALE + uPhase * TILE_PERIOD, r.y / NOISE_SCALE / STRETCH, 0.37);
  float eps = 0.005 / NOISE_SCALE;
  float nx = noise3(base + vec3(eps, 0.0, 0.0)) - noise3(base - vec3(eps, 0.0, 0.0));
  float ny = noise3(base + vec3(0.0, eps, 0.0)) - noise3(base - vec3(0.0, eps, 0.0));
  vec2 shift = normalize(vec2(nx, ny) + 1e-6) * uSplit;
  float roughNoise = noise3(vec3(r.xy, 0.37) * 1000.0);
  float roughDelta = (roughNoise * 2.0 - 1.0) * uRoughness * 0.05 * em;
  float hR = clamp(heightAt(base + vec3(shift, 0.0), em, eps, r + shift * 0.5) + roughDelta, 0.0, 1.0);
  float hG = clamp(heightAt(base, em, eps, r) + roughDelta, 0.0, 1.0);
  float hB = clamp(heightAt(base - vec3(shift, 0.0), em, eps, r - shift * 0.5) + roughDelta, 0.0, 1.0);
  float dR = fwidth(hR) * uRepeats, dG = fwidth(hG) * uRepeats, dB = fwidth(hB) * uRepeats;
  vec3 acc = vec3(0.0);
  for (int s = 0; s < 4; s++) {
    float j = (float(s) + 0.5) / 4.0 - 0.5;
    acc.r += aaLookup(hR * uRepeats + j * dR).r;
    acc.g += aaLookup(hG * uRepeats + j * dG).g;
    acc.b += aaLookup(hB * uRepeats + j * dB).b;
  }
  float alpha = smoothstep(0.45, 0.55, em);
  float n0 = hash3(vec3(gl_FragCoord.xy, 7.0));
  float n1 = hash3(vec3(gl_FragCoord.yx, 3.0));
  vec3 grit = (vec3(n0, mix(n0, n1, 0.65), n1) - 0.5) * uGrain;
  outColor = vec4(clamp(acc * 0.25 + grit, 0.0, 1.0) * alpha, alpha);
}`;

type Renderer = { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };

let renderer: Renderer | null | undefined;
const cache = new Map<string, HTMLCanvasElement>();

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("chrome-finish: shader compile failed", gl.getShaderInfoLog(shader));
  return null;
}

function getRenderer(): Renderer | null {
  if (renderer !== undefined) return renderer;
  renderer = null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  for (const name of ["uSize", "uRadius", "uSigma", "uColors", "uPos", "uCount", "uDepth", "uSplit", "uAngle", "uRepeats", "uPhase", "uLinear", "uWarp", "uGrain", "uRoughness", "uReflection"]) {
    uniforms.set(name, gl.getUniformLocation(program, name));
  }
  renderer = { canvas, gl, program, uniforms };
  return renderer;
}

/**
 * Returns a cached canvas with the chrome finish at `pixelSize` device pixels, or null when
 * WebGL2 is unavailable (callers keep their fallback surface).
 */
export function renderChromeFinish(
  pixelSize: number | { width: number; height: number },
  devicePixelRatio: number,
  options: ChromeFinishOptions,
): HTMLCanvasElement | null {
  const pixelWidth = typeof pixelSize === "number" ? pixelSize : pixelSize.width;
  const pixelHeight = typeof pixelSize === "number" ? pixelSize : pixelSize.height;
  const stops = options.stops.slice(0, 8);
  const params = {
    rounding: options.rounding ?? 0.14,
    depth: options.depth ?? 1,
    split: options.split ?? 10,
    angle: options.angle ?? 30,
    repeats: Math.max(1, Math.round(options.repeats ?? 2)),
    phase: options.phase ?? 0,
    radius: (options.radius ?? 8) * devicePixelRatio,
    linear: options.linear ?? 0,
    warp: options.warp ?? 0.3,
    grain: options.grain ?? 0.2,
    roughness: options.roughness ?? 0.6,
    reflection: REFLECTION_MODES[options.reflection ?? "horizon"],
  };
  const key = JSON.stringify([pixelWidth, pixelHeight, stops, params]);
  const cached = cache.get(key);
  if (cached) return cached;
  const r = getRenderer();
  if (!r || stops.length === 0) return null;
  const { gl, canvas, uniforms } = r;
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  gl.viewport(0, 0, pixelWidth, pixelHeight);
  const colors = new Float32Array(32);
  const positions = new Float32Array(8);
  stops.forEach((stop, i) => {
    colors.set([...stop.color, 1], i * 4);
    positions[i] = stop.position;
  });
  gl.uniform2f(uniforms.get("uSize")!, pixelWidth, pixelHeight);
  gl.uniform1f(uniforms.get("uRadius")!, params.radius);
  gl.uniform1f(uniforms.get("uSigma")!, params.rounding * Math.min(pixelWidth, pixelHeight));
  gl.uniform4fv(uniforms.get("uColors")!, colors);
  gl.uniform1fv(uniforms.get("uPos")!, positions);
  gl.uniform1i(uniforms.get("uCount")!, stops.length);
  gl.uniform1f(uniforms.get("uDepth")!, params.depth);
  gl.uniform1f(uniforms.get("uSplit")!, params.split / 1000);
  gl.uniform1f(uniforms.get("uAngle")!, params.angle);
  gl.uniform1f(uniforms.get("uRepeats")!, params.repeats);
  gl.uniform1f(uniforms.get("uPhase")!, params.phase);
  gl.uniform1f(uniforms.get("uLinear")!, params.linear);
  gl.uniform1f(uniforms.get("uWarp")!, params.warp);
  gl.uniform1f(uniforms.get("uGrain")!, params.grain);
  gl.uniform1f(uniforms.get("uRoughness")!, params.roughness);
  gl.uniform1i(uniforms.get("uReflection")!, params.reflection);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const copy = document.createElement("canvas");
  copy.width = pixelWidth;
  copy.height = pixelHeight;
  copy.getContext("2d")?.drawImage(canvas, 0, 0);
  cache.set(key, copy);
  return copy;
}
