import { test as base, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export { expect };
export type CoreState = { pid: number; dbPath: string; endpoint: string; token: string };
export type Polterware Notes = { app: ElectronApplication; page: Page; directory: string; database: string; startedAt: number; core(): Promise<CoreState>; skipOnboarding(): Promise<void>; seed(count: number): Promise<void>; killCore(signal?: NodeJS.Signals): Promise<number> };
export const test = base.extend<{ pwnotes: Polterware Notes; page: Page }>({
  pwnotes: async ({}, use, info) => {
    const executablePath = process.env.PWNOTES_E2E_EXECUTABLE;
    if (!executablePath || !isAbsolute(executablePath)) throw new Error("Set PWNOTES_E2E_EXECUTABLE to the absolute executable printed by tests/scripts/prepare-e2e.sh");
    const directory = await realpath(await mkdtemp(join(tmpdir(), "notes-w3-e2e-")));
    const database = join(directory, "db", "notes.db");
    await mkdir(dirname(database), { recursive: true });
    const environmentFile = join(directory, "environment.json");
    const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith("PWNOTES_") && key !== "ELECTRON_RUN_AS_NODE")) as Record<string, string>;
    await writeFile(environmentFile, JSON.stringify({ PWNOTES_CORE_DB: database,
      ...(process.env.PWNOTES_E2E_LIVE_NOTIFY === "1" ? {} : { PWNOTES_NOTIFY_MODULE: resolve("tests/helpers/notify-stub.cjs") }) }), { mode: 0o600 });
    let app: ElectronApplication | undefined;
    let launchedProcess: ReturnType<ElectronApplication["process"]> | undefined;
    const profiling = process.env.PWNOTES_E2E_PROFILE === "1";
    const startupTrace = join(directory, "startup-trace.json");
    const core = async () => JSON.parse(await readFile(join(dirname(database), "run/core.json"), "utf8")) as CoreState;
    const killCore = async (signal: NodeJS.Signals = "SIGTERM") => {
      try {
        const state = await core();
        if (state.dbPath !== database || !Number.isSafeInteger(state.pid) || state.pid <= 1) throw new Error("Core identity mismatch");
        try { process.kill(state.pid, 0); } catch { return 0; }
        const command = execFileSync("ps", ["-p", String(state.pid), "-o", "args="], { encoding: "utf8" });
        if (!command.includes(database) || !command.includes("serve")) throw new Error("Core command mismatch");
        process.kill(state.pid, signal);
        return state.pid;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ESRCH") return 0;
        throw error;
      }
    };
    try {
      const startedAt = performance.now();
      const launchedAt = Date.now();
      app = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(directory, "userdata")}`, `--notes-e2e-env=${environmentFile}`,
        ...(profiling ? ["--trace-startup=devtools.timeline,v8,loading,blink.user_timing,disabled-by-default-v8.cpu_profiler", "--trace-startup-duration=5", "--trace-startup-format=json", `--trace-startup-file=${startupTrace}`] : []),
      ], env, timeout: 30_000 });
      // Playwright disposes the application's channel after a normal last-window exit.
      launchedProcess = app.process();
      await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await app.firstWindow();
      page.setDefaultTimeout(10_000);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await use({ app, page, directory, database, startedAt, core, killCore,
        async skipOnboarding() { await expect(page.getByRole("dialog", { name: "Welcome to Polterware Notes" })).toBeVisible(); await page.getByRole("button", { name: "Skip onboarding", exact: true }).click(); },
        async seed(count) { await page.evaluate(async n => { for (let i = 0; i < n; i++) await window.pwnotes.notes.create({ title: `Performance note ${String(i).padStart(5, "0")}`, content: `Benchmark group ${i % 100}` }); }, count); },
      });
      if (profiling) {
        const milestones = {
          mainEntryMs: (await stat(join(directory, "main-started.json"))).mtimeMs - launchedAt,
          coreStateMs: (await stat(join(dirname(database), "run/core.json"))).mtimeMs - launchedAt,
          renderer: await page.evaluate(() => ({
            navigationStartMs: performance.timeOrigin,
            navigation: performance.getEntriesByType("navigation").map(entry => entry.toJSON()),
            paints: performance.getEntriesByType("paint").map(entry => entry.toJSON()),
            resources: performance.getEntriesByType("resource").map(entry => entry.toJSON()),
          })),
          launchedAt,
        };
        await info.attach("startup-milestones", { body: JSON.stringify(milestones), contentType: "application/json" });
      }
      if (errors.length) await info.attach("renderer-errors", { body: JSON.stringify(errors), contentType: "application/json" });
    } finally {
      if (app) {
        if (info.status !== info.expectedStatus) {
          await app.context().tracing.stop({ path: info.outputPath("trace.zip") }).catch(() => {});
          await app.windows()[0]?.screenshot({ path: info.outputPath("failure.png") }).catch(() => {});
        } else await app.context().tracing.stop().catch(() => {});
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([app.close().catch(() => {}), new Promise<void>(done => { timer = setTimeout(() => { if (launchedProcess?.exitCode === null) launchedProcess.kill("SIGKILL"); done(); }, 5000); })]);
        if (timer) clearTimeout(timer);
      }
      // Attach logs only, never core.json or mcp-token (both contain bearer secrets).
      if (profiling) await readFile(startupTrace).then(body => info.attach("startup-chromium-trace", { body, contentType: "application/json" })).catch(() => {});
      for (const name of ["core.log", "notify.log"]) {
        const path = join(dirname(database), "run", name);
        await readFile(path).then(body => info.attach(name, { body, contentType: "text/plain" })).catch(() => {});
      }
      const pid = await killCore();
      if (pid) {
        const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
        try { await expect.poll(alive, { timeout: 5000 }).toBe(false); }
        catch {
          // Main is already closed, so this database cannot legitimately spawn a replacement.
          const state = await core();
          if (state.pid !== pid) throw new Error("Core PID changed during teardown");
          await killCore("SIGKILL");
          await expect.poll(alive, { timeout: 5000 }).toBe(false);
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
  page: async ({ pwnotes }, use) => { await use(pwnotes.page); },
});
