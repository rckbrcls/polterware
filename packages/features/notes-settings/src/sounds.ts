const NAMED = new Set(["glass", "bell", "chime", "ping", "pop", "start", "end", "pause"]);
const TONES: Record<string, number> = { glass: 880, bell: 660, chime: 990, ping: 1320, pop: 440, start: 523, end: 392, pause: 349, default: 880 };

/** Plays a named notification sound. Missing bundled files fall back to a short oscillator. */
export async function previewSound(name: string, fetchImpl: typeof fetch = fetch): Promise<"played" | "synthesized" | "skipped"> {
  if (!name || name === "none") return "skipped";
  const id = NAMED.has(name) ? name : "glass";
  const Audio = globalThis.AudioContext;
  if (!Audio) return "skipped";
  const ctx = new Audio();
  try {
    const response = await fetchImpl(`/sounds/${id}.webm`);
    if (response.ok) {
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      return "played";
    }
  } catch { /* Bundled files are served by the desktop app; synthesize when they are unavailable. */ }
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = TONES[id] ?? TONES.default ?? 880;
  gain.gain.value = 0.08;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.18);
  return "synthesized";
}
