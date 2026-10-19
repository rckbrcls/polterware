export function parseUptime(text: string): number {
  const first = text.trim().split(/\s+/)[0]
  return Number(first) || 0
}
