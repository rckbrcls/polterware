import { For, Index, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import {
  Activity,
  ArrowDataTransferVertical,
  Button,
  Cpu,
  DataTable,
  DragDropVerticalIcon,
  Gauge,
  HardDrive,
  LayoutDashboard,
  ListOrdered,
  MemoryStick,
  PageToolbar,
  Plus,
  ProgressBar,
  Settings,
  Tabs,
  X,
  Zap,
  type HugeiconComponent,
} from "@polterware/frontend-design-system";

/**
 * Illustrative data: a code-built picture of Polterware Vitals (its demo host `prod-edge`),
 * drawn with the app's own cards, tabs and tables, not a live host.
 */
const initial = {
  cpu: [16, 18, 17, 21, 24, 22, 19, 18, 23, 27, 25, 21, 18, 17, 20, 22, 26, 24, 21, 19, 18, 22, 25, 23, 20, 18, 19, 21, 24, 22, 20, 19.8],
  down: [2.4, 2.6, 2.5, 2.9, 3.1, 2.8, 2.6, 2.7, 3.0, 3.3, 3.1, 2.8, 2.5, 2.6, 2.9, 3.2, 3.0, 2.7, 2.6, 2.8, 3.1, 2.9, 2.7, 2.78],
  up: [0.82, 0.9, 0.86, 0.95, 1.04, 0.98, 0.9, 0.88, 0.97, 1.08, 1.02, 0.94, 0.86, 0.9, 0.99, 1.06, 1.0, 0.92, 0.9, 0.95, 1.03, 0.98, 0.93, 0.955],
  cores: [24, 18, 31, 12, 22, 9, 27, 15],
  memory: 41.8,
  pressure: [0.3, 2.1, 1.1],
};

type Live = typeof initial;

const sensors = [
  { value: "46.7", unit: "°C", label: "x86_pkg_temp", percent: 47 },
  { value: "38.4", unit: "°C", label: "nvme", percent: 38 },
  { value: "45", unit: "°C", label: "GPU 0 temp", percent: 45 },
  { value: "13", unit: "%", label: "GPU 0 util", percent: 13 },
  { value: "7", unit: "%", label: "GPU 0 VRAM", percent: 7 },
];

const diskIo = [
  { device: "nvme0n1", read: "7.15 MB/s", write: "3.50 MB/s", util: "18%" },
  { device: "nvme1n1", read: "1.21 MB/s", write: "777.4 KB/s", util: "4%" },
];

const disks = [
  { mount: "/", used: "41.79 GB", size: "100.00 GB", use: "42%" },
  { mount: "/var", used: "121.59 GB", size: "200.00 GB", use: "61%" },
  { mount: "/home", used: "139.69 GB", size: "500.00 GB", use: "28%" },
];

const processes = [
  { pid: "1287", user: "postgres", cpu: "6.4", mem: "3.1", command: "postgres: checkpointer" },
  { pid: "2045", user: "ops", cpu: "4.8", mem: "1.2", command: "node /srv/api/server.js" },
  { pid: "981", user: "root", cpu: "2.1", mem: "0.4", command: "containerd" },
  { pid: "1530", user: "www-data", cpu: "1.7", mem: "0.6", command: "nginx: worker process" },
  { pid: "3112", user: "ops", cpu: "0.9", mem: "0.8", command: "vitals-agent" },
];

const PROMPT = "ops@prod-edge:~$ ";

/** Commands from the app's demo shell, with output in its format. */
const session = [
  { command: "uname", output: ["Linux prod-edge 6.8.0 #1 SMP x86_64 GNU/Linux"] },
  { command: "uptime", output: ["up 14d 3h 0m, 1 user, load average: 0.61, 0.75, 0.68"] },
  {
    command: "ps",
    output: [
      "   PID USER         CPU% COMMAND",
      ...processes.map((row) => `${row.pid.padStart(6)} ${row.user.padEnd(10)} ${row.cpu.padStart(6)} ${row.command}`),
    ],
  },
];

const transcript = [...session.flatMap((step) => [PROMPT + step.command, ...step.output]), PROMPT];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const last = (series: number[]) => series[series.length - 1] ?? 0;
const drift = (value: number, step: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value + (Math.random() - 0.5) * 2 * step));

/** Ticks the demo metrics once a second while the picture is on screen, like a connected host. */
function createLiveMetrics(root: () => HTMLElement | undefined) {
  const [live, setLive] = createSignal<Live>(initial);
  onMount(() => {
    const el = root();
    if (!el || reducedMotion()) return;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => (visible = entry?.isIntersecting ?? false));
    observer.observe(el);
    const timer = window.setInterval(() => {
      if (!visible || document.hidden) return;
      setLive((m) => ({
        cpu: [...m.cpu.slice(1), drift(last(m.cpu), 3, 9, 29)],
        down: [...m.down.slice(1), drift(last(m.down), 0.25, 2.1, 3.4)],
        up: [...m.up.slice(1), drift(last(m.up), 0.07, 0.75, 1.15)],
        cores: m.cores.map((core) => drift(core, 5, 3, 48)),
        memory: drift(m.memory, 0.2, 41.2, 42.6),
        pressure: m.pressure.map((value) => drift(value, 0.3, 0.1, 3.2)),
      }));
    }, 1000);
    onCleanup(() => {
      observer.disconnect();
      window.clearInterval(timer);
    });
  });
  return live;
}

/** A line chart with compact y ticks and grid lines, like the app's uPlot spark charts. */
function Spark(props: { series: number[]; ticks: [number, string][]; max: number; height: number; color: string }) {
  const path = () => {
    const step = 100 / (props.series.length - 1);
    return props.series.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(100 - (v / props.max) * 100).toFixed(2)}`).join(" ");
  };
  return (
    <div class="mk-spark" style={{ height: `${props.height}px` }}>
      <div class="mk-spark-axis">
        <For each={props.ticks}>{([value, label]) => <span style={{ bottom: `${(value / props.max) * 100}%` }}>{label}</span>}</For>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <For each={props.ticks}>{([value]) => <line x1="0" x2="100" y1={100 - (value / props.max) * 100} y2={100 - (value / props.max) * 100} />}</For>
        <path d={path()} style={{ stroke: `var(${props.color})` }} />
      </svg>
    </div>
  );
}

function Card(props: { title: string; icon: HugeiconComponent; class: string; children: JSX.Element }) {
  return (
    <section class={`mk-card card-panel ${props.class}`}>
      <header class="mk-card-head">
        <h3 class="mk-card-title"><props.icon size={14} /> {props.title}</h3>
        <span class="mk-card-grip"><DragDropVerticalIcon size={14} /></span>
      </header>
      <div class="mk-card-body">{props.children}</div>
    </section>
  );
}

function Table<T>(props: { label: string; rows: T[]; columns: [string, (row: T) => string][] }) {
  return (
    <DataTable.Root rows={props.rows} virtualized={false} estimateRowHeight={36}>
      <DataTable.Table aria-label={props.label}>
        <DataTable.Header>
          <For each={props.columns}>{([title]) => <DataTable.ColumnHeader id={title}>{title}</DataTable.ColumnHeader>}</For>
        </DataTable.Header>
        <DataTable.Body<T>>
          {(row) => <DataTable.Row row={row}><For each={props.columns}>{([, cell]) => <DataTable.Cell>{cell(row)}</DataTable.Cell>}</For></DataTable.Row>}
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  );
}

function Sensor(props: { value: string; unit?: string; label: string; percent?: number }) {
  return (
    <div class="mk-sensor">
      <div class="mk-sensor-value">{props.value}<Show when={props.unit}><span class="mk-sensor-unit">{props.unit}</span></Show></div>
      <div class="mk-sensor-label">{props.label}</div>
      <Show when={props.percent !== undefined}><ProgressBar
        label={props.label}
        value={props.percent!}
        aria-valuetext={`${props.value}${props.unit ? ` ${props.unit}` : ""}`}
        size="sm"
        class="mk-bar"
        style={{ "--progress-bar-color": `var(--color-chart-${props.percent! >= 85 ? "red" : props.percent! >= 60 ? "amber" : "cyan"})` }}
      /></Show>
    </div>
  );
}

function Metrics(props: { live: Live }) {
  const cpu = () => last(props.live.cpu);
  const pressure = () => ["CPU", "Memory", "I/O"].map((label, i) => ({ label, value: props.live.pressure[i] ?? 0 }));
  const peak = () => pressure().reduce((top, tile) => (tile.value > top.value ? tile : top));
  return (
    <div class="mk-metrics">
      <Card title="CPU" icon={Cpu} class="mk-tall">
        <div class="mk-stat-block"><div class="mk-stat">{cpu().toFixed(1)}%</div><div class="mk-sub">Load 0.61 / 0.75 / 0.68</div></div>
        <div class="mk-cores">
          <Index each={props.live.cores}>{(usage, i) => <div class="mk-core"><span>cpu{i}</span><span>{Math.round(usage())}%</span><ProgressBar
            label={`cpu${i} usage`}
            value={usage()}
            size="sm"
            class="mk-bar"
            style={{ "--progress-bar-color": `var(--color-chart-${usage() >= 85 ? "red" : usage() >= 60 ? "amber" : "cyan"})` }}
          /></div>}</Index>
        </div>
        <Spark series={props.live.cpu} max={30} height={96} color="--color-chart-red" ticks={[[10, "10"], [20, "20"]]} />
      </Card>
      <Card title="Memory" icon={MemoryStick} class="">
        <div class="mk-stat-block">
          <div class="mk-stat">{props.live.memory.toFixed(1)}%</div>
          <div class="mk-sub">{((props.live.memory / 100) * 32).toFixed(2)} GB / 32.00 GB</div>
          <ProgressBar
            label="Memory usage"
            value={props.live.memory}
            size="sm"
            class="mk-stat-bar"
            style={{ "--progress-bar-color": `var(--color-chart-${props.live.memory >= 85 ? "red" : props.live.memory >= 60 ? "amber" : "cyan"})` }}
          />
        </div>
        <div class="mk-sensors mk-sensors-pair">
          <Sensor value="179.0" unit="MB" label="Swap of 8.00 GB" percent={2} />
          <Sensor value="14d 3h 0m" label="Uptime" />
        </div>
      </Card>
      <Card title="Network" icon={ArrowDataTransferVertical} class="mk-tall">
        <div class="mk-network">
          <div class="mk-ifaces">
            <div class="mk-iface" data-active="true">
              <span>eth0</span><span>Down {last(props.live.down).toFixed(2)} MB/s</span><span>Up {(last(props.live.up) * 1000).toFixed(1)} KB/s</span>
            </div>
            <div class="mk-iface"><span>eth1</span><span>Down 396.0 KB/s</span><span>Up 93.7 KB/s</span></div>
          </div>
          <div class="mk-chart-group">
            <div class="mk-sub">Down eth0 (B/s)</div>
            <Spark series={props.live.down} max={3.6} height={80} color="--color-chart-cyan" ticks={[[1, "1M"], [2, "2M"], [3, "3M"]]} />
          </div>
          <div class="mk-chart-group">
            <div class="mk-sub">Up eth0 (B/s)</div>
            <Spark series={props.live.up} max={1.2} height={80} color="--color-chart-blue" ticks={[[0.3, "300K"], [0.6, "600K"], [0.9, "900K"]]} />
          </div>
        </div>
      </Card>
      <Card title="Disk I/O" icon={Activity} class="mk-wide">
        <Table label="Disk I/O" rows={diskIo} columns={[["Device", (r) => r.device], ["Read", (r) => r.read], ["Write", (r) => r.write], ["Util", (r) => r.util]]} />
      </Card>
      <Card title="Pressure" icon={Gauge} class="">
        <div class="mk-stat-block"><div class="mk-stat">{peak().value.toFixed(1)}%</div><div class="mk-sub">Highest stall: {peak().label}</div></div>
        <div class="mk-sensors">
          <Index each={pressure()}>{(tile) => <Sensor value={tile().value.toFixed(1)} unit="%" label={tile().label} percent={tile().value} />}</Index>
        </div>
      </Card>
      <Card title="Disk" icon={HardDrive} class="mk-wide">
        <Table label="Disks" rows={disks} columns={[["Mount", (r) => r.mount], ["Used", (r) => r.used], ["Size", (r) => r.size], ["Use %", (r) => r.use]]} />
      </Card>
      <Card title="Temperature / GPU" icon={Zap} class="">
        <div class="mk-sensors mk-sensors-fill"><For each={sensors}>{(sensor) => <Sensor {...sensor} />}</For></div>
      </Card>
      <Card title="Processes" icon={ListOrdered} class="mk-wide mk-tall">
        <Table label="Processes" rows={processes} columns={[["PID", (r) => r.pid], ["User", (r) => r.user], ["CPU %", (r) => r.cpu], ["MEM %", (r) => r.mem], ["Command", (r) => r.command]]} />
      </Card>
    </div>
  );
}

/** The session shell, drawn like the app's xterm. `typing` types the commands out each time it opens. */
function Terminal(props: { typing?: boolean }) {
  const [lines, setLines] = createSignal(transcript);
  onMount(() => {
    if (!props.typing || reducedMotion()) return;
    let alive = true;
    onCleanup(() => (alive = false));
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const push = (line: string) => setLines((current) => [...current, line]);
    const type = (char: string) => setLines((current) => [...current.slice(0, -1), current[current.length - 1] + char]);
    setLines([PROMPT]);
    void (async () => {
      for (const step of session) {
        await wait(700);
        for (const char of step.command) {
          if (!alive) return;
          type(char);
          await wait(70 + Math.random() * 60);
        }
        await wait(200);
        if (!alive) return;
        setLines((current) => [...current, ...step.output]);
        push(PROMPT);
      }
    })();
  });
  return (
    <div class="mk-terminal">
      <Index each={lines()}>{(line, i) => <div>{line()}<Show when={i === lines().length - 1}><span class="mk-caret" /></Show></div>}</Index>
    </div>
  );
}

/** The "Unknown host key" dialog the app shows on a first connection, over the terminal. */
function HostKeyDialog() {
  return (
    <div class="mk-dialog-scrim">
      <div class="mk-dialog surface-panel-float">
        <header class="mk-dialog-head">
          <div>
            <h3>Unknown host key</h3>
            <p>First connection to review.example:22. Verify the fingerprint before trusting this server.</p>
          </div>
          <X size={16} />
        </header>
        <code class="mk-fingerprint">SHA256:bW9jay1yZXZpZXctaG9zdC1rZXk=</code>
        <footer class="mk-dialog-foot">
          <Button>Reject</Button>
          <Button variant="brand">Trust and connect</Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Polterware Vitals' window: the host tab strip in the title bar, then the session surface with
 * its Metrics / Terminal tabs, which switch views here too. Metrics tick while on screen.
 * `compact` is a still picture of the terminal with the host key prompt.
 */
export function VitalsMockup(props: { compact?: boolean }) {
  let root: HTMLDivElement | undefined;
  const live = createLiveMetrics(() => root);
  const [view, setView] = createSignal(props.compact ? "terminal" : "metrics");
  const label = () =>
    props.compact
      ? "Polterware Vitals asking to verify the host key of a new server over an open terminal"
      : "Interactive preview of Polterware Vitals: switch between the metrics and terminal views";
  return (
    <div ref={root} class="mk-vitals" classList={{ "mk-compact": props.compact }} role={props.compact ? "img" : "group"} aria-label={label()}>
      <div class="mk-app" inert={props.compact} aria-hidden={props.compact ? "true" : undefined}>
        <div class="mk-titlebar" aria-hidden="true" inert>
          <span class="mk-lights"><i /><i /><i /></span>
          <span class="mk-divider" />
          <span class="mk-pill mk-host-tab">prod-edge</span>
          <span class="mk-pill mk-pill-icon mk-pill-sm"><Plus size={14} /></span>
          <span class="mk-pill mk-pill-icon mk-settings"><Settings size={12} /></span>
        </div>
        <div class="mk-surface surface-panel">
          <PageToolbar.Root>
            <PageToolbar.Tabs>
              <Tabs
                aria-label="Session view"
                items={[{ id: "metrics", label: "Metrics" }, { id: "terminal", label: "Terminal" }]}
                value={view()}
                onChange={setView}
              />
            </PageToolbar.Tabs>
            <Show when={view() === "metrics"}>
              <PageToolbar.Actions><span class="mk-pill mk-pill-icon" aria-hidden="true"><LayoutDashboard size={12} /></span></PageToolbar.Actions>
            </Show>
          </PageToolbar.Root>
          <div class="mk-view" aria-hidden="true" inert>
            <Show when={view() === "terminal"} fallback={<Metrics live={live()} />}>
              <Terminal typing={!props.compact} />
              <Show when={props.compact}><HostKeyDialog /></Show>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
