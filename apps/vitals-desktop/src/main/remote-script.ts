import { SECTION_MARKER } from "../shared/parsers/sections.js";

// One long-running loop instead of one exec per sample: no SSH channel setup
// per second and fewer processes on the host, which would otherwise show up
// in the CPU reading. Fast sections are printed every second; ps every 2s,
// nvidia-smi every 3s, df and thermal zones every 10s. Each sample ends with
// the "end" marker. The thermal loop uses shell builtins only.
export function buildRemoteMetricsScript(): string {
  const m = SECTION_MARKER;
  return `command -v nvidia-smi >/dev/null 2>&1 && gpu=1 || gpu=0
i=0
while :; do
  printf '${m} stat\\n'
  cat /proc/stat 2>/dev/null
  printf '${m} meminfo\\n'
  cat /proc/meminfo 2>/dev/null
  printf '${m} netdev\\n'
  cat /proc/net/dev 2>/dev/null
  printf '${m} loadavg\\n'
  cat /proc/loadavg 2>/dev/null
  printf '${m} uptime\\n'
  cat /proc/uptime 2>/dev/null
  if [ $((i % 2)) -eq 0 ]; then
    printf '${m} ps\\n'
    { ps -eo pid,user,pcpu,pmem,comm --sort=-pcpu 2>/dev/null ||
      ps -eo pid,user,pcpu,pmem,comm 2>/dev/null; } | head -25
  fi
  if [ $((i % 10)) -eq 0 ]; then
    printf '${m} df\\n'
    df -P -k 2>/dev/null
    printf '${m} thermal\\n'
    for z in /sys/class/thermal/thermal_zone*/temp; do
      [ -f "$z" ] || continue
      d=\${z%/temp}
      read -r t < "$z" 2>/dev/null || continue
      printf '%s:%s\\n' "\${d##*/}" "$t"
    done
  fi
  if [ "$gpu" = 1 ] && [ $((i % 3)) -eq 0 ]; then
    printf '${m} nvidia\\n'
    nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null
  fi
  printf '${m} end\\n'
  i=$((i + 1))
  sleep 1
done
`;
}

/** Runs the script under sh regardless of the account's login shell. */
export function buildRemoteMetricsCommand(): string {
  const script = buildRemoteMetricsScript();
  return `sh -c '${script.replace(/'/g, `'\\''`)}'`;
}
