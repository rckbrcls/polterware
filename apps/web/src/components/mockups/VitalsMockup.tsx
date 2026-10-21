import { For } from "solid-js";
import { Cpu, HardDrive, MemoryStick, Network, Server, StatusDot } from "@polterware/frontend-design-system";

/** Illustrative data: a code-built picture of Polterware Vitals, not a live host. */
const hosts = [
  { name: "build-01", tone: "healthy" as const },
  { name: "db-primary", tone: "healthy" as const },
  { name: "edge-sfo", tone: "degraded" as const },
];

const cpu = [22, 28, 25, 31, 44, 38, 35, 52, 61, 48, 42, 39, 45, 58, 66, 54, 47, 41, 38, 43, 49, 46, 40, 36];

const metrics = [
  { label: "Memory", value: "11.2 / 32 GB", icon: MemoryStick, fill: 35 },
  { label: "Disk /", value: "212 / 512 GB", icon: HardDrive, fill: 41 },
  { label: "Network", value: "↓ 48 MB/s  ↑ 6 MB/s", icon: Network, fill: 62 },
];

const processes = [
  ["postgres", "18.4%", "2.1 GB"],
  ["node", "9.7%", "640 MB"],
  ["nginx", "2.3%", "88 MB"],
];

export function VitalsMockup(props: { compact?: boolean }) {
  const path = () => {
    const step = 100 / (cpu.length - 1);
    return cpu.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(100 - v).toFixed(2)}`).join(" ");
  };
  return (
    <div class="mk-window" classList={{ "mk-compact": props.compact }} role="img" aria-label="Polterware Vitals desktop app showing metrics for a remote host">
      <div class="mk-titlebar"><span class="mk-dots"><i /><i /><i /></span><span class="mk-title">Polterware Vitals · build-01</span></div>
      <div class="mk-body">
        <aside class="mk-sidebar">
          <For each={hosts}>{(host, i) => (
            <span class="mk-nav" classList={{ "mk-nav-active": i() === 0 }}>
              <Server size={14} />{host.name}<StatusDot tone={host.tone} class="mk-host-dot" />
            </span>
          )}</For>
        </aside>
        <section class="mk-main">
          <header class="mk-main-head"><strong>build-01</strong><span>ubuntu · 16 cores · up 41d</span></header>
          <div class="mk-chart">
            <span class="mk-chart-label"><Cpu size={14} />CPU<em>43%</em></span>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={path()} fill="none" stroke="var(--color-chart-cyan)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            </svg>
          </div>
          <div class="mk-metrics">
            <For each={props.compact ? metrics.slice(0, 2) : metrics}>{(metric) => (
              <div class="mk-metric">
                <span class="mk-chart-label"><metric.icon size={14} />{metric.label}</span>
                <strong>{metric.value}</strong>
                <span class="mk-bar"><span style={{ width: `${metric.fill}%` }} /></span>
              </div>
            )}</For>
          </div>
          <div class="mk-table" classList={{ "mk-hide-compact": true }}>
            <For each={processes}>{(row) => <div class="mk-table-row"><span>{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span></div>}</For>
          </div>
        </section>
      </div>
    </div>
  );
}
