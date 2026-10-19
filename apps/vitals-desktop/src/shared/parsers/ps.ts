import type { ProcessRow } from '../metrics-types'

export function parsePs(text: string): ProcessRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const rows: ProcessRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    if (parts.length < 5) continue
    const pid = Number(parts[0])
    const user = parts[1]
    const cpuPercent = Number(parts[2]) || 0
    const memPercent = Number(parts[3]) || 0
    const command = parts.slice(4).join(' ')
    rows.push({ pid, user, cpuPercent, memPercent, command })
  }
  return rows
}
