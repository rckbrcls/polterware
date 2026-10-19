import type { MetricsSnapshot } from '../metrics-types'
import { parseDf } from './df'
import { parseLoadavg } from './loadavg'
import { parseMeminfo } from './meminfo'
import { cpuUsagePercent, parseProcStat, type ProcStatSample } from './proc-stat'
import { netRates, parseNetDev, type NetDevSample } from './net-dev'
import { parseNvidiaSmi } from './nvidia-smi'
import { parsePs } from './ps'
import { splitSections } from './sections'
import { parseThermal } from './thermal'
import { parseUptime } from './uptime'

type SlowSections = Pick<MetricsSnapshot, 'disks' | 'processes' | 'thermals' | 'gpus'>

export interface DeltaState {
  procStat: ProcStatSample[]
  netDev: NetDevSample[]
  collectedAt: number
  uptimeSeconds: number
  /** Last values of sections the script prints less often than every sample. */
  slow: SlowSections
}

/**
 * Builds a snapshot from one script sample. Sections missing from the sample
 * keep their previous values. `supported` is false when the host has no
 * /proc/stat (not Linux), so the fallback cannot produce metrics.
 */
export function buildSnapshot(
  raw: string,
  prev: DeltaState | null,
  collectedAt: number
): { snapshot: MetricsSnapshot; state: DeltaState; supported: boolean } {
  const sections = splitSections(raw)
  const procSamples = parseProcStat(sections.stat ?? '')
  const netSamples = parseNetDev(sections.netdev ?? '')
  const uptimeSeconds = parseUptime(sections.uptime ?? '')

  // The host's own uptime clock is immune to SSH delivery jitter; arrival
  // time is the fallback when uptime is missing or did not advance.
  const intervalSec =
    prev && uptimeSeconds > prev.uptimeSeconds && prev.uptimeSeconds > 0
      ? uptimeSeconds - prev.uptimeSeconds
      : prev && prev.collectedAt > 0
        ? Math.max(0.001, (collectedAt - prev.collectedAt) / 1000)
        : 1

  const prevMap = new Map((prev?.procStat ?? []).map((s) => [s.name, s]))
  const cpuCores = procSamples
    .filter((s) => s.name.startsWith('cpu') && s.name !== 'cpu')
    .map((s) => ({
      name: s.name,
      usagePercent: prevMap.has(s.name) ? cpuUsagePercent(prevMap.get(s.name)!, s) : 0
    }))

  const total = procSamples.find((s) => s.name === 'cpu')
  const prevTotal = prevMap.get('cpu')
  const cpuTotalPercent =
    total && prevTotal ? cpuUsagePercent(prevTotal, total) : 0

  const load = parseLoadavg(sections.loadavg ?? '')
  const memory = parseMeminfo(sections.meminfo ?? '')
  const slow: SlowSections = {
    disks: sections.df !== undefined ? parseDf(sections.df) : (prev?.slow.disks ?? []),
    processes: sections.ps !== undefined ? parsePs(sections.ps) : (prev?.slow.processes ?? []),
    thermals: sections.thermal !== undefined ? parseThermal(sections.thermal) : (prev?.slow.thermals ?? []),
    gpus: sections.nvidia !== undefined ? parseNvidiaSmi(sections.nvidia) : (prev?.slow.gpus ?? [])
  }
  const network =
    prev?.netDev.length
      ? netRates(prev.netDev, netSamples, intervalSec)
      : netSamples.map((n) => ({ name: n.name, rxBytesPerSec: 0, txBytesPerSec: 0 }))

  const snapshot: MetricsSnapshot = {
    cpuTotalPercent,
    cpuCores,
    load1: load.load1,
    load5: load.load5,
    load15: load.load15,
    uptimeSeconds,
    memory,
    network,
    ...slow
  }

  return {
    snapshot,
    state: { procStat: procSamples, netDev: netSamples, collectedAt, uptimeSeconds, slow },
    supported: procSamples.length > 0
  }
}
