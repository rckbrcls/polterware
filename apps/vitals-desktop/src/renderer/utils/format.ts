export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatBytesPerSec(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function formatKb(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatNetworkRate(bytesPerSec: number, unit: "bytes" | "bits"): string {
  if (unit === "bytes") return formatBytesPerSec(bytesPerSec);
  const bits = bytesPerSec * 8;
  if (bits < 1000) return bits.toFixed(0) + " bit/s";
  if (bits < 1e6) return (bits / 1000).toFixed(1) + " Kbit/s";
  if (bits < 1e9) return (bits / 1e6).toFixed(2) + " Mbit/s";
  return (bits / 1e9).toFixed(2) + " Gbit/s";
}
