import type { GpuStats } from '../metrics-types'

export function parseNvidiaSmi(text: string): GpuStats[] {
  const gpus: GpuStats[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(',').map((p) => p.trim())
    if (parts.length < 6) continue
    gpus.push({
      index: Number(parts[0]) || 0,
      name: parts[1],
      temperatureC: Number(parts[2]) || 0,
      utilizationPercent: Number(parts[3]) || 0,
      memoryUsedMb: Number(parts[4]) || 0,
      memoryTotalMb: Number(parts[5]) || 0
    })
  }
  return gpus
}
