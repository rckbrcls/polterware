import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './build-snapshot'
import { SECTION_MARKER, SectionFrameBuffer } from './sections'
import { parseDf } from './df'
import { parseLoadavg } from './loadavg'
import { parseMeminfo } from './meminfo'
import { parseNetDev, netRates } from './net-dev'
import { parseNvidiaSmi } from './nvidia-smi'
import { cpuUsagePercent, parseProcStat } from './proc-stat'
import { parsePs } from './ps'
import { splitSections } from './sections'
import { parseThermal } from './thermal'
import { parseUptime } from './uptime'

const SAMPLE_STAT = `cpu  4705 0 2921 145678 120 0 89 0 0 0
cpu0 1200 0 800 36000 30 0 20 0 0 0
cpu1 1100 0 700 36100 25 0 15 0 0 0`

const SAMPLE_STAT_2 = `cpu  4805 0 2951 146678 120 0 89 0 0 0
cpu0 1250 0 820 36500 30 0 20 0 0 0
cpu1 1150 0 720 36600 25 0 15 0 0 0`

const SAMPLE_MEM = `MemTotal:       16384000 kB
MemAvailable:    8192000 kB
SwapTotal:       2097152 kB
SwapFree:        1048576 kB`

const SAMPLE_NET = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000       10    0    0    0     0          0         0     1000       10    0    0    0     0       0          0
  eth0: 5000000  40000    0    0    0     0          0         0  2500000  20000    0    0    0     0       0          0`

const SAMPLE_NET_2 = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000       10    0    0    0     0          0         0     1000       10    0    0    0     0       0          0
  eth0: 5005000  40100    0    0    0     0          0         0  2503000  20100    0    0    0     0       0          0`

const SAMPLE_LOAD = `1.25 0.98 0.75 2/400 12345`

const SAMPLE_UPTIME = `123456.78 987654.32`

const SAMPLE_DF = `Filesystem     1024-blocks      Used Available Use% Mounted on
/dev/sda1       50331648  25165824  22649216  53% /
tmpfs            8192000         0   8192000   0% /dev/shm`

const SAMPLE_PS = `  PID USER     %CPU %MEM COMMAND
    1 root      0.1  0.2 systemd
 1234 www-data 12.5  4.0 nginx: worker process`

const SAMPLE_THERMAL = `thermal_zone0:45200
thermal_zone1:38`

const SAMPLE_NVIDIA = `0, NVIDIA GeForce RTX 3080, 65, 42, 4096, 10240`

const SAMPLE_BUNDLE = `VITALS_SECTION stat
${SAMPLE_STAT}
VITALS_SECTION meminfo
${SAMPLE_MEM}
VITALS_SECTION netdev
${SAMPLE_NET}
VITALS_SECTION loadavg
${SAMPLE_LOAD}
VITALS_SECTION uptime
${SAMPLE_UPTIME}
VITALS_SECTION df
${SAMPLE_DF}
VITALS_SECTION ps
${SAMPLE_PS}
VITALS_SECTION thermal
${SAMPLE_THERMAL}
VITALS_SECTION nvidia
${SAMPLE_NVIDIA}`

describe('splitSections', () => {
  it('parses marked sections', () => {
    const s = splitSections(SAMPLE_BUNDLE)
    expect(s.stat).toContain('cpu  4705')
    expect(s.meminfo).toContain('MemTotal')
    expect(s.nvidia).toContain('RTX 3080')
  })
})

describe('proc-stat', () => {
  it('parses cpu lines', () => {
    const samples = parseProcStat(SAMPLE_STAT)
    expect(samples).toHaveLength(3)
    expect(samples[0].name).toBe('cpu')
  })

  it('computes usage between samples', () => {
    const a = parseProcStat(SAMPLE_STAT)
    const b = parseProcStat(SAMPLE_STAT_2)
    const total = cpuUsagePercent(a[0], b[0])
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThan(100)
  })
})

describe('meminfo', () => {
  it('derives used memory', () => {
    const m = parseMeminfo(SAMPLE_MEM)
    expect(m.totalKb).toBe(16384000)
    expect(m.usedKb).toBe(8192000)
    expect(m.swapUsedKb).toBe(1048576)
  })
})

describe('net-dev', () => {
  it('skips loopback', () => {
    const n = parseNetDev(SAMPLE_NET)
    expect(n).toHaveLength(1)
    expect(n[0].name).toBe('eth0')
  })

  it('computes per-second rates', () => {
    const p = parseNetDev(SAMPLE_NET)
    const c = parseNetDev(SAMPLE_NET_2)
    const rates = netRates(p, c, 1)
    expect(rates[0].rxBytesPerSec).toBe(5000)
    expect(rates[0].txBytesPerSec).toBe(3000)
  })
})

describe('misc parsers', () => {
  it('loadavg', () => {
    expect(parseLoadavg(SAMPLE_LOAD)).toEqual({ load1: 1.25, load5: 0.98, load15: 0.75 })
  })

  it('uptime', () => {
    expect(parseUptime(SAMPLE_UPTIME)).toBe(123456.78)
  })

  it('df', () => {
    const d = parseDf(SAMPLE_DF)
    expect(d[0].mountPoint).toBe('/')
    expect(d[0].usePercent).toBe(53)
  })

  it('ps', () => {
    const p = parsePs(SAMPLE_PS)
    expect(p[1].pid).toBe(1234)
    expect(p[1].command).toContain('nginx')
  })

  it('thermal', () => {
    const t = parseThermal(SAMPLE_THERMAL)
    expect(t[0].celsius).toBeCloseTo(45.2, 1)
    expect(t[1].celsius).toBe(38)
  })

  it('nvidia-smi', () => {
    const g = parseNvidiaSmi(SAMPLE_NVIDIA)
    expect(g[0].memoryTotalMb).toBe(10240)
  })
})

describe('buildSnapshot', () => {
  it('builds full snapshot with deltas', () => {
    const t0 = 1000
    const first = buildSnapshot(SAMPLE_BUNDLE, null, t0)
    expect(first.snapshot.memory.totalKb).toBe(16384000)
    expect(first.snapshot.gpus).toHaveLength(1)

    const bundle2 = SAMPLE_BUNDLE.replace(SAMPLE_STAT, SAMPLE_STAT_2).replace(
      SAMPLE_NET,
      SAMPLE_NET_2
    )
    const second = buildSnapshot(bundle2, first.state, t0 + 1000)
    expect(second.snapshot.cpuTotalPercent).toBeGreaterThan(0)
    expect(second.snapshot.network[0].rxBytesPerSec).toBe(5000)
  })
})

describe('SectionFrameBuffer', () => {
  it('yields complete samples and keeps a partial one', () => {
    const buf = new SectionFrameBuffer()
    const end = `${SECTION_MARKER} end\n`
    expect(buf.push(`${SECTION_MARKER} stat\ncpu 1`)).toEqual([])
    expect(buf.push(` 2\n${end}${SECTION_MARKER} stat\ncpu 3\n${end}${SECTION_MARKER} st`)).toEqual([
      `${SECTION_MARKER} stat\ncpu 1 2\n`,
      `${SECTION_MARKER} stat\ncpu 3\n`
    ])
    expect(buf.push(`at\n${end}`)).toEqual([`${SECTION_MARKER} stat\n`])
  })
})

describe('buildSnapshot streaming', () => {
  it('keeps slow sections that a sample omits', () => {
    const first = buildSnapshot(SAMPLE_BUNDLE, null, 1000)
    const fastOnly = `${SECTION_MARKER} stat\n${SAMPLE_STAT_2}\n${SECTION_MARKER} uptime\n${SAMPLE_UPTIME}\n`
    const second = buildSnapshot(fastOnly, first.state, 2000)
    expect(second.snapshot.gpus).toEqual(first.snapshot.gpus)
    expect(second.snapshot.processes).toEqual(first.snapshot.processes)
    expect(second.snapshot.disks).toEqual(first.snapshot.disks)
  })

  it('uses the host uptime as the rate clock', () => {
    const first = buildSnapshot(SAMPLE_BUNDLE, null, 1000)
    const later = SAMPLE_BUNDLE.replace(SAMPLE_NET, SAMPLE_NET_2).replace(
      SAMPLE_UPTIME,
      SAMPLE_UPTIME.replace('123456.78', '123458.78')
    )
    // Arrived 500ms later over SSH, but the host says 2s passed.
    const second = buildSnapshot(later, first.state, 1500)
    expect(second.snapshot.network[0].rxBytesPerSec).toBeCloseTo(2500, 6)
  })

  it('flags hosts without /proc/stat', () => {
    expect(buildSnapshot(`${SECTION_MARKER} stat\n`, null, 1000).supported).toBe(false)
    expect(buildSnapshot(SAMPLE_BUNDLE, null, 1000).supported).toBe(true)
  })
})
