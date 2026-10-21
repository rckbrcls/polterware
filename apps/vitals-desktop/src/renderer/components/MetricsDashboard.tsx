import { Activity, ArrowDataTransferVertical, Button, Cpu, DataTable, IconTile, EmptyIllustration, Gauge, HardDrive, ListOrdered, MemoryStick, PageEmpty, RefreshCw, Server, StatusChip, Zap } from "@polterware/frontend-design-system";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { connectionPresentation, type ConnectionMetricsMode, type ConnectionStatus, type DiskIoStats, type DiskPartition, type MetricsSnapshot, type NetworkInterface, type SessionHistory } from "../api";
import { formatBytesPerSec, formatNetworkRate, formatKb, formatPercent, formatUptime } from "../utils/format";
import { MetricCard } from "./MetricCard";
import { CARD_IDS, CARD_TITLES, type CardId } from "./card-order";
import { GAP, ROW_H, colsFor, freeCells, packOrder } from "./card-layout";
import type { CardLayoutState } from "./card-layout-state";
import { createCardReorder } from "./card-reorder";
import { EchoRing } from "./EchoRing";
import { ProcessTable } from "./ProcessTable";
import { SparkChart } from "./SparkChart";

function loadLevel(percent: number): "ok" | "warn" | "hot" {
  if (percent >= 85) return "hot";
  if (percent >= 60) return "warn";
  return "ok";
}

function tempLevel(celsius: number): "ok" | "warn" | "hot" {
  if (celsius >= 80) return "hot";
  if (celsius >= 65) return "warn";
  return "ok";
}

type SensorTile = { label: string; title?: string; value: string; unit?: string; percent?: number; level?: "ok" | "warn" | "hot" };

/** "154.4 MB" → value and unit, so tiles can set the unit in smaller type. */
function splitUnit(text: string): { value: string; unit: string } {
  const at = text.lastIndexOf(" ");
  return at < 0 ? { value: text, unit: "" } : { value: text.slice(0, at), unit: text.slice(at + 1) };
}

/** One reading: big value, quiet label, and an optional 0–100 bar. */
function SensorTileView(props: { tile: SensorTile }) {
  return (
    <div class="vitals-sensor" title={props.tile.title}>
      <span class="vitals-sensor-value">
        {props.tile.value}
        <Show when={props.tile.unit}>
          <span class="vitals-sensor-unit">{props.tile.unit}</span>
        </Show>
      </span>
      <span class="vitals-sensor-label">{props.tile.label}</span>
      <Show when={props.tile.percent !== undefined}>
        <div class="vitals-bar" aria-hidden="true">
          <span data-level={props.tile.level} style={{ width: `${Math.min(100, Math.max(0, props.tile.percent ?? 0))}%` }} />
        </div>
      </Show>
    </div>
  );
}

/** Temperature zones, then each GPU as temperature, utilization and VRAM tiles; bars read 0–100. */
function sensorTiles(snapshot: MetricsSnapshot): SensorTile[] {
  const tiles: SensorTile[] = snapshot.thermals.map((zone) => ({
    label: zone.id,
    title: zone.id,
    value: zone.celsius.toFixed(1),
    unit: "°C",
    percent: zone.celsius,
    level: tempLevel(zone.celsius),
  }));
  for (const gpu of snapshot.gpus) {
    const title = `GPU ${gpu.index} ${gpu.name}`;
    const vram = gpu.memoryTotalMb > 0 ? (gpu.memoryUsedMb / gpu.memoryTotalMb) * 100 : 0;
    tiles.push(
      { label: `GPU ${gpu.index} temp`, title, value: String(gpu.temperatureC), unit: "°C", percent: gpu.temperatureC, level: tempLevel(gpu.temperatureC) },
      { label: `GPU ${gpu.index} util`, title, value: String(gpu.utilizationPercent), unit: "%", percent: gpu.utilizationPercent, level: loadLevel(gpu.utilizationPercent) },
      { label: `GPU ${gpu.index} VRAM`, title: `${title}: ${gpu.memoryUsedMb}/${gpu.memoryTotalMb} MB`, value: vram.toFixed(0), unit: "%", percent: vram, level: loadLevel(vram) },
    );
  }
  return tiles;
}

function pressureLevel(value: number): "ok" | "warn" | "hot" {
  if (value >= 50) return "hot";
  if (value >= 10) return "warn";
  return "ok";
}

export function MetricsDashboard(props: {
  snapshot: MetricsSnapshot | null;
  history: SessionHistory;
  status: ConnectionStatus;
  mode?: ConnectionMetricsMode;
  message?: string;
  label?: string;
  networkUnit: "bytes" | "bits";
  historyLimit: number;
  layout: CardLayoutState;
  onKill: (pid: number) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const failed = () => props.status === "error" || props.status === "disconnected";
  const waiting = () => props.snapshot === null && (props.status === "connecting" || props.status === "connected" || props.status === "reconnecting");
  const showHead = () => !waiting() && (props.mode === "fallback" || Boolean(props.message && props.status !== "connected"));
  const [pickedIface, setPickedIface] = createSignal<string | undefined>();
  const { order, setOrder, anchors, setAnchors } = props.layout;
  const [grid, setGrid] = createSignal<HTMLElement>();
  const [cols, setCols] = createSignal(2);
  createEffect(() => {
    const element = grid();
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const inner = element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setCols(colsFor(inner));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });
  const gridStyle = () => ({ "--vitals-cols": cols(), "--vitals-row-h": `${ROW_H}px`, "--vitals-gap": `${GAP}px` });
  const available = (id: CardId): boolean => {
    const snapshot = props.snapshot;
    if (!snapshot) return false;
    if (id === "network") return (snapshot.network?.length ?? 0) > 0;
    if (id === "diskio") return (snapshot.diskIo?.length ?? 0) > 0;
    if (id === "pressure") return Boolean(snapshot.pressure);
    if (id === "thermal") return snapshot.thermals.length > 0 || snapshot.gpus.length > 0;
    return true;
  };
  // DOM order stays fixed; placement is purely grid coordinates, so moving a card never re-parents it.
  const shown = (id: CardId) => available(id) && !props.layout.isHidden(id);
  const present = createMemo(() => CARD_IDS.filter(shown));
  const visible = createMemo(() => order().filter(shown));
  const rects = createMemo(() => packOrder(visible(), cols(), anchors()));
  const reorder = createCardReorder({ grid, cols, rects, order, setOrder, anchors, setAnchors });
  createEffect(() => props.layout.publish({ available: CARD_IDS.filter(available), cols: cols() }));
  props.layout.bindArrange(reorder.arrange);
  onCleanup(() => props.layout.bindArrange(null));
  /** Empty spots shown under the grid while a card is held, so free cells read as drop targets. */
  const dropSlots = createMemo(() => {
    const held = reorder.draggingId();
    return held ? freeCells(rects(), held, cols()) : [];
  });
  const memPct = () => {
    const memory = props.snapshot?.memory;
    if (!memory || memory.totalKb <= 0) return 0;
    return (memory.usedKb / memory.totalKb) * 100;
  };
  const swapPct = () => {
    const memory = props.snapshot?.memory;
    if (!memory || memory.swapTotalKb <= 0) return 0;
    return (memory.swapUsedKb / memory.swapTotalKb) * 100;
  };
  const selectedIface = (network: NetworkInterface[]) => {
    const picked = pickedIface();
    if (picked && network.some((iface) => iface.name === picked)) return picked;
    return network[0]?.name;
  };
  const ifaceSeries = (name: string | undefined) => {
    if (!name) return { rx: [] as number[], tx: [] as number[] };
    return props.history.interfaces[name] ?? { rx: [], tx: [] };
  };

  return (
    <Show
      when={!(failed() && props.snapshot === null)}
      fallback={
        <PageEmpty
          title={props.status === "disconnected" ? "Disconnected" : "Connection failed"}
          description={props.message || "The host could not be reached."}
          illustration={
            <EmptyIllustration class="vitals-empty-illustration">
              <IconTile size={28} dimmed seed="host-unreachable">
                <Server size={16} />
              </IconTile>
            </EmptyIllustration>
          }
          action={
            <div class="vitals-error-actions">
              <Button onClick={() => props.onClose()}>
                Close
              </Button>
              <Button variant="brand" onClick={() => props.onRetry()}>
                <RefreshCw size={14} />
                Retry
              </Button>
            </div>
          }
        />
      }
    >
    <div class="vitals-stack">
      <Show when={showHead()}>
        <div class="vitals-card-head vitals-status-head">
          <Show when={props.mode === "fallback"}>
            <StatusChip tone="warn">Script fallback</StatusChip>
          </Show>
          <Show when={props.message && props.status !== "connected"}>
            <StatusChip tone={connectionPresentation(props.status).tone}>
              {connectionPresentation(props.status).label}
            </StatusChip>
            <p class="vitals-sub">{props.message}</p>
          </Show>
        </div>
      </Show>

      <Show
        when={!waiting()}
        fallback={
          <div class="vitals-connecting" role="status" aria-live="polite">
            <EchoRing class="vitals-connecting-echo" label={connectionPresentation(props.status).label} />
            <p class="vitals-connecting-title">
              {props.status === "reconnecting" ? "Reconnecting to" : "Connecting to"} {props.label ?? "host"}
            </p>
            <p class="vitals-sub">{props.message || "Waiting for the first metrics..."}</p>
          </div>
        }
      >
        <Show when={props.snapshot} fallback={<p class="vitals-sub">No metrics for this session.</p>}>
          {(snapshot) => {
            const card = (id: CardId) => {
              switch (id) {
                case "cpu":
                  return (
                    <MetricCard id="cpu" title={CARD_TITLES.cpu} icon={Cpu} reorder={reorder} rect={rects().get("cpu")}>
                      <div class="vitals-stat-block">
                        <div class="vitals-stat">{formatPercent(props.history.cpuDisplay ?? snapshot().cpuTotalPercent)}</div>
                        <div class="vitals-sub">
                          Load {snapshot().load1.toFixed(2)} / {snapshot().load5.toFixed(2)} / {snapshot().load15.toFixed(2)}
                        </div>
                      </div>
                      <Show when={(snapshot().cpuCores?.length ?? 0) > 0}>
                        <div class="vitals-cores">
                          <For each={snapshot().cpuCores}>
                            {(core) => (
                              <div class="vitals-core">
                                <span>{core.name}</span>
                                <span>{formatPercent(core.usagePercent, 0)}</span>
                                <div class="vitals-bar" aria-hidden="true">
                                  <span data-level={loadLevel(core.usagePercent)} style={{ width: `${Math.min(100, Math.max(0, core.usagePercent))}%` }} />
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      <SparkChart series={props.history.cpu.slice(-props.historyLimit)} label="CPU %" />
                    </MetricCard>
                  );
                case "memory":
                  return (
                    <MetricCard id="memory" title={CARD_TITLES.memory} icon={MemoryStick} reorder={reorder} rect={rects().get("memory")}>
                      <div class="vitals-stat-block">
                        <div class="vitals-stat">{formatPercent(memPct())}</div>
                        <div class="vitals-sub">
                          {formatKb(snapshot().memory.usedKb)} / {formatKb(snapshot().memory.totalKb)}
                        </div>
                        <div class="vitals-bar vitals-stat-bar" aria-hidden="true">
                          <span data-level={loadLevel(memPct())} style={{ width: `${Math.min(100, Math.max(0, memPct()))}%` }} />
                        </div>
                      </div>
                      <div class="vitals-sensors vitals-sensors-pair">
                        <SensorTileView
                          tile={{
                            ...splitUnit(formatKb(snapshot().memory.swapUsedKb)),
                            label: `Swap of ${formatKb(snapshot().memory.swapTotalKb)}`,
                            percent: swapPct(),
                            level: loadLevel(swapPct()),
                          }}
                        />
                        <SensorTileView tile={{ value: formatUptime(snapshot().uptimeSeconds), label: "Uptime" }} />
                      </div>
                    </MetricCard>
                  );
                case "network":
                  return (
                    <MetricCard id="network" title={CARD_TITLES.network} icon={ArrowDataTransferVertical} reorder={reorder} rect={rects().get("network")}>
                      <div class="vitals-stack vitals-network">
                        <div class="vitals-ifaces">
                          <For each={snapshot().network}>
                            {(iface) => (
                              <button
                                type="button"
                                class="vitals-iface"
                                aria-pressed={iface.name === selectedIface(snapshot().network)}
                                data-active={iface.name === selectedIface(snapshot().network) ? "true" : "false"}
                                onClick={() => setPickedIface(iface.name)}
                              >
                                <span>{iface.name}</span>
                                <span>Down {formatNetworkRate(iface.rxBytesPerSec, props.networkUnit)}</span>
                                <span>Up {formatNetworkRate(iface.txBytesPerSec, props.networkUnit)}</span>
                              </button>
                            )}
                          </For>
                        </div>
                        <Show when={selectedIface(snapshot().network)}>
                          {(name) => (
                            <>
                              <div class="vitals-chart-group">
                                <div class="vitals-sub">Down {name()} ({props.networkUnit === "bits" ? "bit/s" : "B/s"})</div>
                                <SparkChart
                                  height={80}
                                  series={ifaceSeries(name()).rx.slice(-props.historyLimit).map((value) => props.networkUnit === "bits" ? value * 8 : value)}
                                  label={`Receive ${name()}`}
                                  strokeToken="--color-chart-cyan"
                                />
                              </div>
                              <div class="vitals-chart-group">
                                <div class="vitals-sub">Up {name()} ({props.networkUnit === "bits" ? "bit/s" : "B/s"})</div>
                                <SparkChart
                                  height={80}
                                  series={ifaceSeries(name()).tx.slice(-props.historyLimit).map((value) => props.networkUnit === "bits" ? value * 8 : value)}
                                  label={`Transmit ${name()}`}
                                  strokeToken="--color-chart-blue"
                                />
                              </div>
                            </>
                          )}
                        </Show>
                      </div>
                    </MetricCard>
                  );
                case "diskio":
                  return (
                    <MetricCard id="diskio" title={CARD_TITLES.diskio} icon={Activity} reorder={reorder} rect={rects().get("diskio")}>
                      <DataTable.Root rows={snapshot().diskIo ?? []} getRowId={(row) => row.device} virtualized={false} estimateRowHeight={36} columnWidthsKey="disk-io">
                        <DataTable.Table aria-label="Disk I/O">
                          <DataTable.Header>
                            <DataTable.ColumnHeader<DiskIoStats> id="device" sortBy={(row) => row.device}>
                              Device
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader<DiskIoStats> id="read" sortBy={(row) => row.readBytesPerSec}>
                              Read
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader<DiskIoStats> id="write" sortBy={(row) => row.writeBytesPerSec}>
                              Write
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader<DiskIoStats> id="util" sortBy={(row) => row.utilPercent}>
                              Util
                            </DataTable.ColumnHeader>
                          </DataTable.Header>
                          <DataTable.Body<DiskIoStats>>
                            {(row) => (
                              <DataTable.Row row={row}>
                                <DataTable.Cell>{row.device}</DataTable.Cell>
                                <DataTable.Cell>{formatBytesPerSec(row.readBytesPerSec)}</DataTable.Cell>
                                <DataTable.Cell>{formatBytesPerSec(row.writeBytesPerSec)}</DataTable.Cell>
                                <DataTable.Cell>{formatPercent(row.utilPercent, 0)}</DataTable.Cell>
                              </DataTable.Row>
                            )}
                          </DataTable.Body>
                        </DataTable.Table>
                      </DataTable.Root>
                    </MetricCard>
                  );
                case "pressure":
                  return (
                    <MetricCard id="pressure" title={CARD_TITLES.pressure} icon={Gauge} reorder={reorder} rect={rects().get("pressure")}>
                      <Show when={snapshot().pressure} fallback={<p class="vitals-sub">No pressure data reported.</p>}>
                        {(pressure) => {
                          const tiles = () => [
                            { label: "CPU", value: pressure().cpu },
                            { label: "Memory", value: pressure().memory },
                            { label: "I/O", value: pressure().io },
                          ];
                          const peak = () => tiles().reduce((top, tile) => (tile.value > top.value ? tile : top));
                          return (
                            <>
                              <div class="vitals-stat-block">
                                <div class="vitals-stat">{formatPercent(peak().value)}</div>
                                <div class="vitals-sub">Highest stall: {peak().label}</div>
                              </div>
                              <div class="vitals-sensors">
                                <For each={tiles()}>
                                  {(tile) => (
                                    <SensorTileView
                                      tile={{
                                        value: tile.value.toFixed(1),
                                        unit: "%",
                                        label: tile.label,
                                        title: `${tile.label}: share of time tasks stalled`,
                                        percent: tile.value,
                                        level: pressureLevel(tile.value),
                                      }}
                                    />
                                  )}
                                </For>
                              </div>
                            </>
                          );
                        }}
                      </Show>
                    </MetricCard>
                  );
                case "disk":
                  return (
                    <MetricCard id="disk" title={CARD_TITLES.disk} icon={HardDrive} reorder={reorder} rect={rects().get("disk")}>
                      <DataTable.Root rows={snapshot().disks} getRowId={(row) => row.mountPoint} virtualized={false} estimateRowHeight={36} columnWidthsKey="disks">
                        <DataTable.Table aria-label="Disks">
                          <DataTable.Header>
                            <DataTable.ColumnHeader<DiskPartition> id="mount" sortBy={(row) => row.mountPoint}>
                              Mount
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader<DiskPartition> id="used" sortBy={(row) => row.usedKb}>
                              Used
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader<DiskPartition> id="size" sortBy={(row) => row.sizeKb}>
                              Size
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader<DiskPartition> id="use" sortBy={(row) => row.usePercent}>
                              Use %
                            </DataTable.ColumnHeader>
                          </DataTable.Header>
                          <DataTable.Body<DiskPartition>>
                            {(disk) => (
                              <DataTable.Row row={disk}>
                                <DataTable.Cell>{disk.mountPoint}</DataTable.Cell>
                                <DataTable.Cell>{formatKb(disk.usedKb)}</DataTable.Cell>
                                <DataTable.Cell>{formatKb(disk.sizeKb)}</DataTable.Cell>
                                <DataTable.Cell>{formatPercent(disk.usePercent, 0)}</DataTable.Cell>
                              </DataTable.Row>
                            )}
                          </DataTable.Body>
                        </DataTable.Table>
                      </DataTable.Root>
                    </MetricCard>
                  );
                case "thermal":
                  return (
                    <MetricCard id="thermal" title={CARD_TITLES.thermal} icon={Zap} reorder={reorder} rect={rects().get("thermal")}>
                      <Show when={sensorTiles(snapshot()).length > 0} fallback={<p class="vitals-sub">No sensors reported.</p>}>
                        <div class="vitals-sensors">
                          <For each={sensorTiles(snapshot())}>{(tile) => <SensorTileView tile={tile} />}</For>
                        </div>
                      </Show>
                    </MetricCard>
                  );
                case "processes":
                  return (
                    <MetricCard id="processes" title={CARD_TITLES.processes} icon={ListOrdered} reorder={reorder} rect={rects().get("processes")}>
                      <ProcessTable rows={snapshot().processes} onKill={props.onKill} />
                    </MetricCard>
                  );
              }
            };
            return (
              <div ref={setGrid} class="vitals-metrics" style={gridStyle()}>
                <For each={dropSlots()}>
                  {(slot) => (
                    <div
                      class="vitals-drop-slot"
                      aria-hidden="true"
                      style={{ "grid-column": `${slot.x + 1}`, "grid-row": `${slot.y + 1}` }}
                    />
                  )}
                </For>
                <For each={present()}>{(id) => card(id)}</For>
              </div>
            );
          }}
        </Show>
      </Show>
    </div>
    </Show>
  );
}
