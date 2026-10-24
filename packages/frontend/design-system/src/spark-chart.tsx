import { createEffect, onCleanup, onMount } from "solid-js";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

const DEFAULT_HEIGHT = 96;

/** Short axis ticks (1.2K, 3.4M) so large byte rates fit the narrow axis instead of truncating. */
function compactTick(value: number): string {
  const abs = Math.abs(value);
  for (const [unit, size] of [["G", 1e9], ["M", 1e6], ["K", 1e3]] as const) {
    if (abs >= size) return `${Number((value / size).toFixed(1))}${unit}`;
  }
  return String(Number(value.toFixed(1)));
}

/** Fits the value axis to its longest tick label, so short labels do not leave a gutter on the left. */
function fitAxisSize(self: uPlot, values: string[] | null, axisIdx: number, cycleNum: number): number {
  const axis = self.axes[axisIdx] as uPlot.Axis & { _size?: number; font?: [string, number] };
  if (cycleNum > 1 && axis._size !== undefined) return axis._size;
  const longest = (values ?? []).reduce((widest, value) => (value.length > widest.length ? value : widest), "");
  let size = (axis.gap ?? 0) + (axis.ticks?.show === false ? 0 : axis.ticks?.size ?? 0);
  if (longest && axis.font) {
    self.ctx.font = axis.font[0];
    size += self.ctx.measureText(longest).width / devicePixelRatio;
  }
  return Math.ceil(size);
}

function tokenColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export type SparkChartProps = {
  series: number[];
  label: string;
  strokeToken?: string;
  height?: number;
  /** Draws the time axis and an optional quota-reset marker. Sparklines leave this off. */
  axes?: boolean;
  /** Epoch milliseconds, one per series point. */
  times?: number[];
  /** Epoch milliseconds for the quota reset marker. */
  resetAt?: number;
  /** Appended to value-axis ticks, such as "%". */
  valueSuffix?: string;
  /** Canvas inset [top, right, bottom, left]. Bottom keeps the lowest tick inside the frame. */
  padding?: readonly [number, number, number, number];
};

function formatChartTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 1e8) return compactTick(seconds);
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleString(undefined, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

export function SparkChart(props: SparkChartProps) {
  let host: HTMLDivElement | undefined;
  let plot: uPlot | undefined;
  let resetAtSec: number | undefined;

  const height = () => props.height ?? DEFAULT_HEIGHT;
  const strokeToken = () => props.strokeToken ?? "--color-chart-red";

  function syncReset() {
    const value = props.resetAt;
    resetAtSec = props.axes && value !== undefined && Number.isFinite(value) ? value / 1000 : undefined;
  }

  function aligned(): uPlot.AlignedData {
    const series = props.series.length ? props.series : [0];
    const times = props.times;
    if (!props.axes || !times || times.length !== series.length || times.some((time) => Number.isNaN(time))) {
      return [series.map((_, index) => index), series];
    }
    let last = -Infinity;
    const xs = times.map((time) => {
      const seconds = time / 1000;
      const next = seconds <= last ? last + 0.001 : seconds;
      last = next;
      return next;
    });
    return [xs, series];
  }

  onMount(() => {
    const element = host;
    if (!element) return;
    const width = element.clientWidth || 280;
    const axesMode = props.axes === true;
    const suffix = props.valueSuffix ?? "";
    syncReset();
    const valueTicks = (_: uPlot, splits: number[]) => splits.map((value) => {
      const tick = compactTick(value);
      return suffix ? `${tick}${suffix}` : tick;
    });
    plot = new uPlot(
      {
        width,
        height: height(),
        series: [
          {},
          {
            label: props.label,
            stroke: tokenColor(strokeToken()),
            width: 2,
          },
        ],
        axes: [
          axesMode
            ? {
                stroke: tokenColor("--color-chart-axis"),
                grid: { show: false },
                size: fitAxisSize,
                gap: 6,
                ticks: { show: false },
                values: (_, splits) => splits.map(formatChartTime),
              }
            : { show: false },
          {
            stroke: tokenColor("--color-chart-axis"),
            grid: { show: true, stroke: tokenColor("--color-chart-grid") },
            size: fitAxisSize,
            gap: 6,
            ticks: { show: false },
            values: valueTicks,
          },
        ],
        scales: axesMode
          ? {
              x: {
                time: false,
                range: (_self, min, max) => {
                  if (resetAtSec === undefined) return [min, max];
                  return [Math.min(min, resetAtSec), Math.max(max, resetAtSec)];
                },
              },
            }
          : undefined,
        hooks: axesMode
          ? {
              draw: [
                (self) => {
                  if (resetAtSec === undefined) return;
                  const x = self.valToPos(resetAtSec, "x", false);
                  const { left, top, width: plotWidth, height: plotHeight } = self.bbox;
                  if (x < left || x > left + plotWidth) return;
                  const color = tokenColor("--color-chart-amber") || tokenColor("--color-chart-axis");
                  const ctx = self.ctx;
                  ctx.save();
                  ctx.strokeStyle = color;
                  ctx.fillStyle = color;
                  ctx.lineWidth = 1;
                  ctx.setLineDash([3, 3]);
                  ctx.beginPath();
                  ctx.moveTo(x, top);
                  ctx.lineTo(x, top + plotHeight);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  ctx.beginPath();
                  ctx.arc(x, top, 2.5, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.restore();
                },
              ],
            }
          : undefined,
        legend: { show: false },
        padding: [
          props.padding?.[0] ?? 8,
          props.padding?.[1] ?? 8,
          props.padding?.[2] ?? 0,
          props.padding?.[3] ?? 0,
        ],
      },
      aligned(),
      element,
    );

    const observer = new ResizeObserver(() => {
      if (!plot || !host) return;
      plot.setSize({ width: host.clientWidth || 280, height: height() });
    });
    observer.observe(element);
    onCleanup(() => {
      observer.disconnect();
      plot?.destroy();
      plot = undefined;
    });
  });

  createEffect(() => {
    const next = aligned();
    const label = props.label;
    const stroke = tokenColor(strokeToken());
    syncReset();
    if (!plot) return;
    const series = plot.series[1];
    if (series) {
      series.label = label;
      series.stroke = () => stroke; // uPlot normalizes stroke to a function
    }
    plot.setData(next);
  });

  return (
    <div
      class={`vitals-chart shrink-0 ${props.axes ? "w-full" : ""}`}
      ref={host}
      style={{ height: `${height()}px` }}
      role="img"
      aria-label={props.label}
    />
  );
}
