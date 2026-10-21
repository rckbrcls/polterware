/** Time constant for the smoothed CPU readout, close to top's 3s window. */
export const DISPLAY_SMOOTHING_SECONDS = 3

/**
 * Exponential moving average for a displayed value. The weight depends on
 * the real gap between samples, so a late sample moves the value further.
 * No previous value, a non-positive gap, or a gap longer than five time
 * constants (a reconnect) returns `next` unchanged.
 */
export function smoothValue(
  prev: number | null,
  next: number,
  dtSec: number,
  tauSec = DISPLAY_SMOOTHING_SECONDS
): number {
  if (prev === null || !Number.isFinite(prev) || dtSec <= 0 || dtSec > tauSec * 5) return next
  const alpha = 1 - Math.exp(-dtSec / tauSec)
  return prev + alpha * (next - prev)
}
