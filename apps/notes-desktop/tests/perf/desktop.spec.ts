import { test, expect } from "../fixtures";
import { driver } from "../helpers/driver";
import { execFileSync } from "node:child_process";

// Startup is measured from process launch to visible interactive Inbox/Today content.
// This deliberately includes the fresh database and onboarding rather than subtracting them.
test("startup and idle process RSS", async ({ pwnotes, page }, info) => {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Welcome to Polterware Notes" })).toBeVisible();
  const startupMs = performance.now() - pwnotes.startedAt;
  await pwnotes.skipOnboarding();
  await expect(page.getByText("Connecting…", { exact: true })).toHaveCount(0);
  // Let startup work settle before sampling idle RSS.
  await page.waitForTimeout(5000);
  const core = await pwnotes.core();
  const rendererPid = await pwnotes.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId());
  const rssMB = (pid: number) => Number(execFileSync("ps", ["-p", String(pid), "-o", "rss="], { encoding: "utf8" }).trim()) / 1024;
  const result = { startupMs, mainRSSMB: rssMB(pwnotes.app.process().pid!), rendererRSSMB: rssMB(rendererPid), coreRSSMB: rssMB(core.pid) };
  await info.attach("desktop-performance", { body: JSON.stringify(result), contentType: "application/json" });
  console.log("PERF desktop", JSON.stringify(result));
  expect.soft(result.coreRSSMB, "Core idle RSS < 60 MB").toBeLessThan(60);
  expect.soft(startupMs, "First meaningful paint < 1000 ms (conservative interactive proxy)").toBeLessThan(1000);
});

test("10k notes virtualization and list scrolling FPS trace", async ({ pwnotes, page }, info) => {
  test.setTimeout(600_000);
  await pwnotes.skipOnboarding();
  await driver(pwnotes, "seed");
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(page.getByText("Live · 10000 notes", { exact: true })).toBeVisible({ timeout: 60_000 });
  const scroll = page.locator('.pw-data-table-scroll[data-virtualized="true"]');
  await expect(scroll).toBeVisible();
  const renderedRows = await page.locator("[data-row-id]").count();
  expect(renderedRows, "Virtualized list must render a nonempty subset").toBeGreaterThan(0);
  expect(renderedRows).toBeLessThan(100);
  const session = await page.context().newCDPSession(page);
  const events: unknown[] = [];
  session.on("Tracing.dataCollected", event => events.push(...event.value));
  await session.send("Tracing.start", { categories: "devtools.timeline,benchmark,cc", transferMode: "ReportEvents" });
  const samples = await scroll.evaluate(async element => {
    const durations: number[] = []; let previous = 0;
    for (let frame = 0; frame < 180; frame++) {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * frame / 179;
      const current = await new Promise<number>(requestAnimationFrame);
      if (previous) durations.push(current - previous); previous = current;
    }
    durations.sort((a, b) => a - b);
    const averageMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    return { averageMs, fps: 1000 / averageMs, p95Ms: durations[Math.ceil(durations.length * 0.95) - 1] };
  });
  const finished = new Promise<void>(done => session.once("Tracing.tracingComplete", () => done()));
  await session.send("Tracing.end"); await finished;
  await info.attach("scroll-chromium-trace", { body: JSON.stringify({ traceEvents: events }), contentType: "application/json" });
  await info.attach("scroll-performance", { body: JSON.stringify({ ...samples, renderedRows }), contentType: "application/json" });
  console.log("PERF scroll", JSON.stringify({ ...samples, renderedRows }));
  expect(samples.averageMs, "60 Hz average frame budget, timer rounding allowed").toBeLessThanOrEqual(17.2);
  expect(samples.p95Ms).toBeLessThanOrEqual(20);
});
