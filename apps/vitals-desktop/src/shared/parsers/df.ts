import type { DiskPartition } from '../metrics-types'

export function parseDf(text: string): DiskPartition[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const disks: DiskPartition[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/)
    if (parts.length < 6) continue
    const usePercent = Number(parts[4].replace('%', '')) || 0
    const mountPoint = parts.slice(5).join(' ')
    disks.push({
      filesystem: parts[0],
      sizeKb: Number(parts[1]) || 0,
      usedKb: Number(parts[2]) || 0,
      availKb: Number(parts[3]) || 0,
      usePercent,
      mountPoint
    })
  }
  return disks
}
