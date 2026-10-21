export interface NetDevSample {
  name: string
  rxBytes: number
  txBytes: number
}

export function parseNetDev(text: string): NetDevSample[] {
  const result: NetDevSample[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('Inter-') || trimmed.startsWith('face')) continue
    const colon = trimmed.indexOf(':')
    if (colon < 0) continue
    const name = trimmed.slice(0, colon).trim()
    const rest = trimmed.slice(colon + 1).trim().split(/\s+/)
    if (rest.length < 16) continue
    const rxBytes = Number(rest[0]) || 0
    const txBytes = Number(rest[8]) || 0
    if (name === 'lo') continue
    result.push({ name, rxBytes, txBytes })
  }
  return result
}

export function netRates(
  prev: NetDevSample[],
  curr: NetDevSample[],
  intervalSec: number
): { name: string; rxBytesPerSec: number; txBytesPerSec: number }[] {
  if (intervalSec <= 0) return []
  const prevMap = new Map(prev.map((n) => [n.name, n]))
  const rates: { name: string; rxBytesPerSec: number; txBytesPerSec: number }[] = []
  for (const c of curr) {
    const p = prevMap.get(c.name)
    if (!p) {
      rates.push({ name: c.name, rxBytesPerSec: 0, txBytesPerSec: 0 })
      continue
    }
    const drx = Math.max(0, c.rxBytes - p.rxBytes)
    const dtx = Math.max(0, c.txBytes - p.txBytes)
    rates.push({
      name: c.name,
      rxBytesPerSec: drx / intervalSec,
      txBytesPerSec: dtx / intervalSec
    })
  }
  return rates
}
