/** Wire types for the vitals-agent NDJSON stream (protocol v = 1). */

export const AGENT_PROTOCOL_VERSION = 1 as const

export interface HelloFrame {
  type: 'hello'
  v: 1
  agentVersion: string
  arch: string
  hostname: string
  kernel: string
  cpuCount: number
}

export interface CpuCoreFrame {
  name: string
  usagePercent: number
}

export interface MemoryFrame {
  totalKb: number
  availableKb: number
  usedKb: number
  swapTotalKb: number
  swapFreeKb: number
  swapUsedKb: number
}

export interface NetworkFrame {
  name: string
  rxBytesPerSec: number
  txBytesPerSec: number
}

export interface DiskIoFrame {
  device: string
  readBytesPerSec: number
  writeBytesPerSec: number
  utilPercent: number
}

export interface PressureFrame {
  cpu: number
  memory: number
  io: number
}

export interface DiskFrame {
  filesystem: string
  sizeKb: number
  usedKb: number
  availKb: number
  usePercent: number
  mountPoint: string
}

export interface ProcessFrame {
  pid: number
  user: string
  cpuPercent: number
  memPercent: number
  command: string
}

export interface ThermalFrame {
  id: string
  celsius: number
}

export interface GpuFrame {
  index: number
  name: string
  temperatureC: number
  utilizationPercent: number
  memoryUsedMb: number
  memoryTotalMb: number
}

/**
 * Fast fields are always present. disks, processes, thermals, and gpus are
 * present only on the tick that recollected them. pressure is omitted when
 * /proc/pressure is not available.
 */
export interface MetricsFrame {
  type: 'metrics'
  tsUnixMs: number
  monoNs: number
  cpuTotalPercent: number
  cpuCores: CpuCoreFrame[]
  load: [number, number, number]
  uptimeSeconds: number
  memory: MemoryFrame
  network: NetworkFrame[]
  diskIo: DiskIoFrame[]
  pressure?: PressureFrame
  disks?: DiskFrame[]
  processes?: ProcessFrame[]
  thermals?: ThermalFrame[]
  gpus?: GpuFrame[]
}

export interface KillCommand {
  cmd: 'kill'
  pid: number
  signal: 'TERM' | 'KILL'
  id: string
}

export interface PingCommand {
  cmd: 'ping'
}

export type AgentCommand = KillCommand | PingCommand

export interface KillResultFrame {
  type: 'kill_result'
  id: string
  ok: boolean
  error?: string
}

export interface PongFrame {
  type: 'pong'
}

export interface WarnFrame {
  type: 'warn'
  collector: string
  message: string
}

export type AgentFrame = HelloFrame | MetricsFrame | KillResultFrame | PongFrame | WarnFrame
