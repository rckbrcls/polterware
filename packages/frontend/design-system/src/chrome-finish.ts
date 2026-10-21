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
  /** Film grain strength (0–1). */
  grain?: number;
};

type Rgb = readonly [number, number, number];

/** Horizon ramp tinted toward `tint`: light sky, one sharp dark horizon at `horizon`, lighter ground. */
export function chromeStopsFromTint(tint: Rgb, horizon = 0.5): ChromeStop[] {
  const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return [
    { position: 0, color: mix(tint, [1, 1, 1], 0.6) },
    { position: horizon - 0.02, color: mix(tint, [1, 1, 1], 0.15) },
    { position: horizon, color: mix(tint, [0, 0, 0], 0.3) },
    { position: Math.min(horizon + 0.12, 0.98), color: mix(tint, [0, 0, 0], 0.05) },
    { position: 1, color: mix(tint, [1, 1, 1], 0.45) },
  ];
}

/** Named reflections: `horizon` is the default, `subtle` is a flatter, steeper line. */
export const CHROME_PRESETS = {
  horizon: { repeats: 1, warp: 0.3 },
  subtle: { repeats: 1, warp: 0.15, angle: -35 },
} satisfies Record<string, Partial<ChromeFinishOptions>>;

export type ChromePreset = keyof typeof CHROME_PRESETS;

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
 * One procedural take on a preset: the reflection tilts, bends, and sits at a different height,
 * and the noise and RGB split shift, so no two neighbouring tiles share a highlight.
 */
export function chromeVariant(index: number, preset: ChromePreset = "horizon"): { options: Partial<ChromeFinishOptions>; horizon: number } {
  // mulberry32: a few well-spread numbers from a small integer.
  let state = Math.imul((index % CHROME_VARIANTS) + 1, 0x9e3779b9);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const base: Partial<ChromeFinishOptions> = CHROME_PRESETS[preset];
  const between = (min: number, max: number) => min + (max - min) * next();
  return {
    options: {
      ...base,
      angle: (base.angle ?? -24) + between(-26, 26),
      warp: (base.warp ?? 0.3) * between(0.5, 1.6),
      phase: between(-1, 1),
      split: between(6, 16),
    },
    horizon: between(0.38, 0.62),
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

const float TILE_PERIOD = 8.0;
const float NOISE_SCALE = 0.5;
const float STRETCH = 2.0;

vec4 ramp(float t) {
  if (uCount <= 1 || t <= uPos[0]) return uColors[0];
  int last = uCount - 1;
  if (t >= uPos[last]) return uColors[last];
  for (int i = 0; i < 7; i++) {
    if (i >= last) break;
    if (t <= uPos[i + 1]) return mix(uColors[i], uColors[i + 1], (t - uPos[i]) / max(uPos[i + 1] - uPos[i], 1e-5));
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

float heightAt(vec3 np, float em, float eps, float band) {
  float n = noise3(np);
  float dx = noise3(np + vec3(eps, 0.0, 0.0)) - noise3(np - vec3(eps, 0.0, 0.0));
  float dy = noise3(np + vec3(0.0, eps, 0.0)) - noise3(np - vec3(0.0, eps, 0.0));
  float organic = mix(0.5, n * em, uDepth) + (dx + dy) * 0.5 * uDepth * 0.3;
  // Horizon reflection: a straight ramp across the rotated tile, bent by the noise and lifted at the rim.
  float horizon = band + (n - 0.5) * uWarp + (1.0 - em) * 0.12 * uDepth;
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
  float hR = clamp(heightAt(base + vec3(shift, 0.0), em, eps, r.y + shift.y * 0.5), 0.0, 1.0);
  float hG = clamp(heightAt(base, em, eps, r.y), 0.0, 1.0);
  float hB = clamp(heightAt(base - vec3(shift, 0.0), em, eps, r.y - shift.y * 0.5), 0.0, 1.0);
  float dR = fwidth(hR) * uRepeats, dG = fwidth(hG) * uRepeats, dB = fwidth(hB) * uRepeats;
  vec3 acc = vec3(0.0);
  for (int s = 0; s < 4; s++) {
    float j = (float(s) + 0.5) / 4.0 - 0.5;
    acc.r += aaLookup(hR * uRepeats + j * dR).r;
    acc.g += aaLookup(hG * uRepeats + j * dG).g;
    acc.b += aaLookup(hB * uRepeats + j * dB).b;
  }
  float alpha = smoothstep(0.45, 0.55, em);
  float grain = (hash3(vec3(gl_FragCoord.xy, 7.0)) - 0.5) * uGrain;
  outColor = vec4(clamp(acc * 0.25 + grain, 0.0, 1.0) * alpha, alpha);
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
  for (const name of ["uSize", "uRadius", "uSigma", "uColors", "uPos", "uCount", "uDepth", "uSplit", "uAngle", "uRepeats", "uPhase", "uLinear", "uWarp", "uGrain"]) {
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
    angle: options.angle ?? -24,
    repeats: Math.max(1, Math.round(options.repeats ?? 1)),
    phase: options.phase ?? 0,
    radius: (options.radius ?? 8) * devicePixelRatio,
    linear: options.linear ?? 1,
    warp: options.warp ?? 0.3,
    grain: options.grain ?? 0.09,
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
