export interface ProcStatSample {
  name: string
  user: number
  nice: number
  system: number
  idle: number
  iowait: number
  irq: number
  softirq: number
  steal: number
  guest: number
  guestNice: number
}

export function parseProcStat(text: string): ProcStatSample[] {
  const samples: ProcStatSample[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('cpu')) continue
    const parts = line.trim().split(/\s+/)
    const name = parts[0]
    if (!name) continue
    const nums = parts.slice(1).map((p) => Number(p) || 0)
    samples.push({
      name,
      user: nums[0] ?? 0,
      nice: nums[1] ?? 0,
      system: nums[2] ?? 0,
      idle: nums[3] ?? 0,
      iowait: nums[4] ?? 0,
      irq: nums[5] ?? 0,
      softirq: nums[6] ?? 0,
      steal: nums[7] ?? 0,
      guest: nums[8] ?? 0,
      guestNice: nums[9] ?? 0
    })
  }
  return samples
}

// guest and guestNice are already counted inside user and nice (proc(5)),
// so adding them again would double count time spent running VMs.
function busyTicks(s: ProcStatSample): number {
  return s.user + s.nice + s.system + s.irq + s.softirq + s.steal
}

function totalTicks(s: ProcStatSample): number {
  return busyTicks(s) + s.idle + s.iowait
}

export function cpuUsagePercent(prev: ProcStatSample, curr: ProcStatSample): number {
  const dt = totalTicks(curr) - totalTicks(prev)
  if (dt <= 0) return 0
  const db = busyTicks(curr) - busyTicks(prev)
  return Math.max(0, Math.min(100, (db / dt) * 100))
}
