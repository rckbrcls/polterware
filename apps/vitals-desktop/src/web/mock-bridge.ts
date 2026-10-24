import type {
  ConnectPayload,
  ConnectionStateEvent,
  DiskIoStats,
  DiskPartition,
  HostKeyPrompt,
  MetricsEvent,
  MetricsSnapshot,
  NetworkInterface,
  PressureStats,
  ProcessRow,
  SavedServerPublic,
  ShellDataEvent,
  ShellExitEvent,
  ThermalZone,
  VitalsApi,
} from "../renderer/api";

import { normalizeSettings, type VitalsSettings } from "../shared/settings";

const DEMO_SERVER: SavedServerPublic = {
  id: "prod-edge",
  label: "prod-edge",
  host: "10.0.0.12",
  port: 22,
  username: "ops",
  authMode: "privateKey",
  privateKeyPath: "/Users/ops/.ssh/id_ed25519",
};

const REVIEW_HOST = "review.example";
const DOWN_HOST = "down.example";
const HOST_KEY = "SHA256:bW9jay1yZXZpZXctaG9zdC1rZXk=";
const CONNECT_DELAY_MS = 400;
const METRICS_INTERVAL_MS = 1000;
const MEMORY_TOTAL_KB = 32 * 1024 * 1024;
const SWAP_TOTAL_KB = 8 * 1024 * 1024;
const GPU_MEMORY_TOTAL_MB = 8192;

interface DiskSpec {
  filesystem: string;
  mountPoint: string;
  sizeGb: number;
  usePercent: number;
}

interface Sample {
  cores: number[];
  memUsedPct: number;
  swapUsedPct: number;
  rx: number[];
  tx: number[];
  diskUse: number[];
  diskRead: number[];
  diskWrite: number[];
  diskUtil: number[];
  pressure: PressureStats;
  thermals: number[];
  gpuTemp: number;
  gpuUtil: number;
  gpuMemoryMb: number;
  processes: ProcessRow[];
}

interface MockSession {
  sessionId: string;
  label: string;
  host: string;
  port: number;
  username: string;
  status: ConnectionStateEvent["status"];
  mode?: ConnectionStateEvent["mode"];
  message?: string;
  startedAt: number;
  uptimeBase: number;
  sample: Sample;
  connectTimer?: ReturnType<typeof setTimeout>;
  metricsTimer?: ReturnType<typeof setInterval>;
}

interface ShellState {
  line: string;
  escape: "none" | "esc" | "csi";
}

const DISKS: DiskSpec[] = [
  { filesystem: "/dev/nvme0n1p2", mountPoint: "/", sizeGb: 100, usePercent: 42 },
  { filesystem: "/dev/nvme0n1p3", mountPoint: "/var", sizeGb: 200, usePercent: 61 },
  { filesystem: "/dev/nvme1n1p1", mountPoint: "/home", sizeGb: 500, usePercent: 28 },
];

const IFACE_NAMES = ["eth0", "eth1"];
const DISK_DEVICES = ["nvme0n1", "nvme1n1"];

function hub<T>() {
  const listeners = new Set<(event: T) => void>();
  return {
    emit(event: T) {
      for (const listener of [...listeners]) listener(event);
    },
    on(cb: (event: T) => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

function walk(value: number, min: number, max: number, step: number): number {
  const next = value + (Math.random() * 2 - 1) * step;
  return Math.min(max, Math.max(min, next));
}

function processes(): ProcessRow[] {
  return [
    { pid: 1, user: "root", cpuPercent: 0.1, memPercent: 0.2, command: "/sbin/init" },
    { pid: 412, user: "root", cpuPercent: 1.4, memPercent: 0.8, command: "vitals-agent" },
    { pid: 880, user: "www", cpuPercent: 12.4, memPercent: 6.1, command: "node server.js" },
    { pid: 1024, user: "postgres", cpuPercent: 4.8, memPercent: 11.2, command: "postgres: writer" },
    { pid: 1402, user: "root", cpuPercent: 0.4, memPercent: 0.3, command: "/usr/sbin/sshd" },
    { pid: 2210, user: "www", cpuPercent: 2.1, memPercent: 3.4, command: "nginx: worker" },
  ];
}

function sampleFor(host: string): Sample {
  const busy = host === "10.0.0.21";
  const quiet = host === REVIEW_HOST;
  const cpu = busy ? 34 : quiet ? 9 : 18;
  const memory = busy ? 78 : quiet ? 22 : 41;
  return {
    cores: Array.from({ length: 8 }, (_, index) => walk(cpu, 4, 90, index % 2 === 0 ? 6 : 3)),
    memUsedPct: memory,
    swapUsedPct: busy ? 12 : 2,
    rx: [busy ? 18_000_000 : 2_400_000, 400_000],
    tx: [busy ? 6_000_000 : 900_000, 120_000],
    diskUse: DISKS.map((disk) => (busy && disk.mountPoint === "/var" ? 71 : disk.usePercent)),
    diskRead: [busy ? 42_000_000 : 8_000_000, 1_200_000],
    diskWrite: [busy ? 21_000_000 : 3_000_000, 600_000],
    diskUtil: [busy ? 48 : 12, 4],
    pressure: { cpu: busy ? 8 : 1.2, memory: busy ? 14 : 0.4, io: busy ? 6 : 0.8 },
    thermals: [busy ? 68 : 47, busy ? 51 : 39],
    gpuTemp: busy ? 62 : 44,
    gpuUtil: busy ? 36 : 8,
    gpuMemoryMb: busy ? 3100 : 640,
    processes: processes(),
  };
}

function kb(gigabytes: number): number {
  return gigabytes * 1024 * 1024;
}

function uptimeSeconds(session: MockSession): number {
  return session.uptimeBase + (Date.now() - session.startedAt) / 1000;
}

function cpuTotal(sample: Sample): number {
  const total = sample.cores.reduce((sum, value) => sum + value, 0);
  return total / sample.cores.length;
}

function snapshot(session: MockSession): MetricsSnapshot {
  const sample = session.sample;
  const usedKb = Math.round((MEMORY_TOTAL_KB * sample.memUsedPct) / 100);
  const swapUsedKb = Math.round((SWAP_TOTAL_KB * sample.swapUsedPct) / 100);
  const disks: DiskPartition[] = DISKS.map((disk, index) => {
    const sizeKb = kb(disk.sizeGb);
    const usePercent = sample.diskUse[index] ?? disk.usePercent;
    const used = Math.round((sizeKb * usePercent) / 100);
    return {
      filesystem: disk.filesystem,
      sizeKb,
      usedKb: used,
      availKb: sizeKb - used,
      usePercent: Math.round(usePercent),
      mountPoint: disk.mountPoint,
    };
  });
  const network: NetworkInterface[] = IFACE_NAMES.map((name, index) => ({
    name,
    rxBytesPerSec: sample.rx[index] ?? 0,
    txBytesPerSec: sample.tx[index] ?? 0,
  }));
  const diskIo: DiskIoStats[] = DISK_DEVICES.map((device, index) => ({
    device,
    readBytesPerSec: sample.diskRead[index] ?? 0,
    writeBytesPerSec: sample.diskWrite[index] ?? 0,
    utilPercent: sample.diskUtil[index] ?? 0,
  }));
  const thermals: ThermalZone[] = [
    { id: "x86_pkg_temp", celsius: sample.thermals[0] ?? 0 },
    { id: "nvme", celsius: sample.thermals[1] ?? 0 },
  ];
  const load = cpuTotal(sample) / 25;
  return {
    cpuTotalPercent: cpuTotal(sample),
    cpuCores: sample.cores.map((usagePercent, index) => ({ name: `cpu${index}`, usagePercent })),
    load1: load,
    load5: load * 0.92,
    load15: load * 0.84,
    uptimeSeconds: uptimeSeconds(session),
    memory: {
      totalKb: MEMORY_TOTAL_KB,
      availableKb: MEMORY_TOTAL_KB - usedKb,
      usedKb,
      swapTotalKb: SWAP_TOTAL_KB,
      swapFreeKb: SWAP_TOTAL_KB - swapUsedKb,
      swapUsedKb,
    },
    disks,
    network,
    processes: sample.processes.map((row) => ({ ...row })),
    thermals,
    gpus: [
      {
        index: 0,
        name: "NVIDIA RTX 4000",
        temperatureC: Math.round(sample.gpuTemp),
        utilizationPercent: Math.round(sample.gpuUtil),
        memoryUsedMb: Math.round(sample.gpuMemoryMb),
        memoryTotalMb: GPU_MEMORY_TOTAL_MB,
      },
    ],
    diskIo,
    pressure: { ...sample.pressure },
    serverTimestamp: Date.now(),
  };
}

function advance(sample: Sample) {
  sample.cores = sample.cores.map((value) => walk(value, 2, 96, 8));
  sample.memUsedPct = walk(sample.memUsedPct, 12, 92, 1.5);
  sample.swapUsedPct = walk(sample.swapUsedPct, 0, 40, 0.4);
  sample.rx = sample.rx.map((value) => walk(value, 10_000, 80_000_000, value * 0.15));
  sample.tx = sample.tx.map((value) => walk(value, 8_000, 40_000_000, value * 0.15));
  sample.diskUse = sample.diskUse.map((value) => walk(value, 8, 92, 0.15));
  sample.diskRead = sample.diskRead.map((value) => walk(value, 0, 120_000_000, value * 0.2 + 50_000));
  sample.diskWrite = sample.diskWrite.map((value) => walk(value, 0, 80_000_000, value * 0.2 + 20_000));
  sample.diskUtil = sample.diskUtil.map((value) => walk(value, 0, 95, 4));
  sample.pressure = {
    cpu: walk(sample.pressure.cpu, 0, 80, 1.5),
    memory: walk(sample.pressure.memory, 0, 80, 1.2),
    io: walk(sample.pressure.io, 0, 80, 1.2),
  };
  sample.thermals = sample.thermals.map((value) => walk(value, 32, 88, 0.6));
  sample.gpuTemp = walk(sample.gpuTemp, 35, 84, 0.8);
  sample.gpuUtil = walk(sample.gpuUtil, 0, 98, 6);
  sample.gpuMemoryMb = walk(sample.gpuMemoryMb, 200, GPU_MEMORY_TOTAL_MB - 200, 80);
  for (const row of sample.processes) {
    if (row.pid === 1) continue;
    row.cpuPercent = walk(row.cpuPercent, 0, 80, 2.5);
    row.memPercent = walk(row.memPercent, 0.1, 40, 0.3);
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} days, ${hours}:${String(minutes).padStart(2, "0")}`;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function installVitalsMock(): void {
  const servers: SavedServerPublic[] = [
    { ...DEMO_SERVER },
    {
      id: "db-1",
      label: "db-1",
      host: "10.0.0.21",
      port: 22,
      username: "postgres",
      authMode: "password",
    },
    {
      id: "review",
      label: "review",
      host: REVIEW_HOST,
      port: 22,
      username: "deploy",
      authMode: "privateKey",
      privateKeyPath: "/Users/deploy/.ssh/id_ed25519",
    },
  ];
  const sessions = new Map<string, MockSession>();
  const shells = new Map<string, ShellState>();
  const connection = hub<ConnectionStateEvent>();
  const metrics = hub<MetricsEvent>();
  const hostKeys = hub<HostKeyPrompt>();
  const shellData = hub<ShellDataEvent>();
  const shellExit = hub<ShellExitEvent>();

  const emitState = (session: MockSession) => {
    connection.emit({
      sessionId: session.sessionId,
      status: session.status,
      message: session.message,
      label: session.label,
      host: session.host,
      mode: session.mode,
    });
  };

  const publish = (session: MockSession) => {
    metrics.emit({
      sessionId: session.sessionId,
      snapshot: snapshot(session),
      collectedAt: Date.now(),
    });
  };

  const stopTimers = (session: MockSession) => {
    if (session.connectTimer !== undefined) clearTimeout(session.connectTimer);
    if (session.metricsTimer !== undefined) clearInterval(session.metricsTimer);
    session.connectTimer = undefined;
    session.metricsTimer = undefined;
  };

  const goLive = (session: MockSession) => {
    if (session.status !== "connecting") return;
    session.status = "connected";
    session.mode = "agent";
    session.message = undefined;
    session.startedAt = Date.now();
    emitState(session);
    publish(session);
    session.metricsTimer = setInterval(() => {
      if (session.status !== "connected") return;
      advance(session.sample);
      publish(session);
    }, METRICS_INTERVAL_MS);
  };

  const prompt = (session: MockSession) => `${session.username}@${session.label}:~$ `;

  const commandOutput = (session: MockSession, line: string): string => {
    const [command] = line.trim().split(/\s+/);
    if (!command) return "";
    const current = snapshot(session);
    if (command === "help") {
      return "help    show commands\r\nuname   print system name\r\nuptime  print uptime\r\nps      list processes";
    }
    if (command === "uname") {
      return `Linux ${session.label} 6.8.0-mock #1 SMP x86_64 GNU/Linux`;
    }
    if (command === "uptime") {
      const load = `${current.load1.toFixed(2)}, ${current.load5.toFixed(2)}, ${current.load15.toFixed(2)}`;
      return `up ${formatUptime(current.uptimeSeconds)}, 1 user, load average: ${load}`;
    }
    if (command === "ps") {
      const rows = current.processes.map(
        (row) =>
          `${String(row.pid).padStart(6)} ${row.user.padEnd(10)} ${row.cpuPercent.toFixed(1).padStart(6)} ${row.command}`,
      );
      return ["   PID USER         CPU% COMMAND", ...rows].join("\r\n");
    }
    return `sh: ${command}: command not found`;
  };

  const writeShell = (sessionId: string, data: string) => {
    shellData.emit({ sessionId, data });
  };

  const finishLine = (session: MockSession, shell: ShellState) => {
    const line = shell.line;
    shell.line = "";
    writeShell(session.sessionId, "\r\n");
    const output = commandOutput(session, line);
    if (output) writeShell(session.sessionId, `${output}\r\n`);
    writeShell(session.sessionId, prompt(session));
  };

  const remember = (payload: ConnectPayload) => {
    if (payload.serverId) {
      const server = servers.find((item) => item.id === payload.serverId);
      if (!server) return;
      server.label = payload.label || payload.host;
      server.host = payload.host;
      server.port = payload.port;
      server.username = payload.username;
      server.authMode = payload.authMode;
      server.privateKeyPath = payload.authMode === "privateKey" ? payload.privateKeyPath : undefined;
      return;
    }
    if (!payload.save) return;
    const exists = servers.some(
      (server) => server.host === payload.host && server.port === payload.port && server.username === payload.username,
    );
    if (exists) return;
    servers.push({
      id: `srv-${crypto.randomUUID()}`,
      label: payload.label || payload.host,
      host: payload.host,
      port: payload.port,
      username: payload.username,
      authMode: payload.authMode,
      privateKeyPath: payload.authMode === "privateKey" ? payload.privateKeyPath : undefined,
    });
  };

  const settingsChanged = hub<VitalsSettings>();
  const readSettings = () => {
    try {
      const raw = localStorage.getItem("vitals-web-settings");
      return normalizeSettings(raw ? JSON.parse(raw) : { theme: localStorage.getItem("vitals-web-theme") });
    }
    catch { return normalizeSettings(null); }
  };
  const knownHosts = new Map<string, string>();
  const api: VitalsApi = {
    async getSettings() { return readSettings(); },
    async updateSettings(patch) {
      const settings = normalizeSettings({ ...readSettings(), ...patch });
      localStorage.setItem("vitals-web-settings", JSON.stringify(settings));
      settingsChanged.emit(settings);
      return settings;
    },
    onSettingsChanged: settingsChanged.on,
    async listKnownHosts() { return [...knownHosts].map(([key, fingerprint]) => ({ key, fingerprint })); },
    async removeKnownHost(key) { knownHosts.delete(key); },
    async connect(payload) {
      const sessionId = payload.sessionId ?? crypto.randomUUID();
      const session: MockSession = {
        sessionId,
        label: payload.label || payload.host,
        host: payload.host,
        port: payload.port,
        username: payload.username,
        status: "connecting",
        startedAt: Date.now(),
        uptimeBase: 14 * 86400 + 3 * 3600,
        sample: sampleFor(payload.host),
      };
      sessions.set(sessionId, session);
      remember(payload);
      emitState(session);
      session.connectTimer = setTimeout(() => {
        if (session.status !== "connecting") return;
        if (session.host === DOWN_HOST) {
          session.status = "error";
          session.message = "Connection refused";
          emitState(session);
          return;
        }
        if (session.host === REVIEW_HOST && knownHosts.get(session.host + ":" + session.port) !== HOST_KEY) {
          hostKeys.emit({
            sessionId,
            host: session.host,
            port: session.port,
            fingerprint: HOST_KEY,
          });
          return;
        }
        goLive(session);
      }, CONNECT_DELAY_MS);
      return { sessionId };
    },
    async disconnect(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return;
      stopTimers(session);
      session.status = "disconnected";
      session.mode = undefined;
      emitState(session);
      if (shells.has(sessionId)) {
        shells.delete(sessionId);
        shellExit.emit({ sessionId });
      }
    },
    async listServers() {
      return servers.map((server) => ({ ...server }));
    },
    async deleteServer(id) {
      const index = servers.findIndex((server) => server.id === id);
      if (index >= 0) servers.splice(index, 1);
    },
    async acceptHostKey(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return;
      knownHosts.set(session.host + ":" + session.port, HOST_KEY);
      goLive(session);
    },
    async rejectHostKey(sessionId) {
      const session = sessions.get(sessionId);
      if (!session || session.status !== "connecting") return;
      session.status = "error";
      session.message = "Host key rejected";
      emitState(session);
    },
    async killProcess(payload) {
      const session = sessions.get(payload.sessionId);
      if (!session || session.status !== "connected") throw new Error("Session is not connected");
      const index = session.sample.processes.findIndex((row) => row.pid === payload.pid);
      if (index < 0) throw new Error(`Process ${payload.pid} is not running`);
      session.sample.processes.splice(index, 1);
      publish(session);
    },
    async getTheme() {
      return "dark";
    },
    async setTheme(theme) {
      await api.updateSettings({ theme });
    },
    onConnectionState: connection.on,
    onMetrics: metrics.on,
    onHostKeyPrompt: hostKeys.on,
    async shellOpen(payload) {
      const session = sessions.get(payload.sessionId);
      if (!session || session.status !== "connected") throw new Error("Shell is not connected");
      shells.set(payload.sessionId, { line: "", escape: "none" });
      writeShell(payload.sessionId, `Mock shell on ${session.label}. Type help.\r\n${prompt(session)}`);
    },
    async shellWrite(payload) {
      const session = sessions.get(payload.sessionId);
      const shell = shells.get(payload.sessionId);
      if (!session || !shell || session.status !== "connected") return;
      for (const char of payload.data) {
        if (shell.escape === "esc") {
          shell.escape = char === "[" ? "csi" : "none";
          continue;
        }
        if (shell.escape === "csi") {
          if (char >= "@" && char <= "~") shell.escape = "none";
          continue;
        }
        if (char === "\u001b") {
          shell.escape = "esc";
          continue;
        }
        if (char === "\r" || char === "\n") {
          finishLine(session, shell);
          continue;
        }
        if (char === "\u007f" || char === "\b") {
          if (!shell.line) continue;
          shell.line = shell.line.slice(0, -1);
          writeShell(payload.sessionId, "\b \b");
          continue;
        }
        if (char === "\u0003") {
          shell.line = "";
          writeShell(payload.sessionId, `^C\r\n${prompt(session)}`);
          continue;
        }
        if (char < " ") continue;
        shell.line += char;
        writeShell(payload.sessionId, char);
      }
    },
    async shellResize() {},
    async shellClose(sessionId) {
      shells.delete(sessionId);
    },
    async shellAck() {},
    onShellData: shellData.on,
    onShellExit: shellExit.on,
  };

  window.vitals = api;
}

export function connectDemoSession(): void {
  void window.vitals.connect({
    serverId: DEMO_SERVER.id,
    label: DEMO_SERVER.label,
    host: DEMO_SERVER.host,
    port: DEMO_SERVER.port,
    username: DEMO_SERVER.username,
    authMode: DEMO_SERVER.authMode,
    privateKeyPath: DEMO_SERVER.privateKeyPath,
  });
}
