export const STARTUP_TIMING_ENV = "PWNOTES_STARTUP_TIMING";
export type StartupPhase = "electron-ready" | "core-attach" | "policy-rpc" | "window-show";
const PHASES: readonly StartupPhase[] = ["electron-ready", "core-attach", "policy-rpc", "window-show"];

export function startupTimingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[STARTUP_TIMING_ENV] === "1";
}

export function createStartupClock(options: { now?: () => number; enabled?: boolean } = {}) {
  const now = options.now ?? (() => performance.now());
  const enabled = options.enabled ?? true;
  const origin = now();
  const marks = new Map<StartupPhase, number>();
  return {
    mark(phase: StartupPhase) {
      if (!enabled || marks.has(phase)) return;
      marks.set(phase, now() - origin);
    },
    report(): Partial<Record<StartupPhase, number>> {
      return Object.fromEntries(marks) as Partial<Record<StartupPhase, number>>;
    },
    format(): string {
      return PHASES.filter(phase => marks.has(phase))
        .map(phase => `startup.${phase}=${marks.get(phase)!.toFixed(1)}ms`)
        .join(" ");
    },
  };
}

export type StartupClock = ReturnType<typeof createStartupClock>;
