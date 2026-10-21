import type { MemoryStats } from '../metrics-types'

function readKb(map: Map<string, number>, key: string): number {
  return map.get(key) ?? 0
}

export function parseMeminfo(text: string): MemoryStats {
  const map = new Map<string, number>()
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z0-9()]+):\s+(\d+)/)
    if (!m) continue
    map.set(m[1], Number(m[2]))
  }
  const totalKb = readKb(map, 'MemTotal')
  const availableKb = readKb(map, 'MemAvailable') || readKb(map, 'MemFree')
  const usedKb = Math.max(0, totalKb - availableKb)
  const swapTotalKb = readKb(map, 'SwapTotal')
  const swapFreeKb = readKb(map, 'SwapFree')
  const swapUsedKb = Math.max(0, swapTotalKb - swapFreeKb)
  return {
    totalKb,
    availableKb,
    usedKb,
    swapTotalKb,
    swapFreeKb,
    swapUsedKb
  }
}
