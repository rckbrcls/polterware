import type { ThermalZone } from '../metrics-types'

export function parseThermal(text: string): ThermalZone[] {
  const zones: ThermalZone[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.lastIndexOf(':')
    if (idx < 0) continue
    const id = trimmed.slice(0, idx).trim()
    const raw = Number(trimmed.slice(idx + 1).trim())
    if (!Number.isFinite(raw)) continue
    const celsius = raw > 1000 ? raw / 1000 : raw
    zones.push({ id, celsius })
  }
  return zones
}
