export function parseLoadavg(text: string): { load1: number; load5: number; load15: number } {
  const first = text.trim().split(/\s+/).slice(0, 3).map(Number)
  return {
    load1: first[0] ?? 0,
    load5: first[1] ?? 0,
    load15: first[2] ?? 0
  }
}
