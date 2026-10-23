import { test, expect } from "../fixtures";

test("core crash restarts and the open window recovers persisted data", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  const id = await page.evaluate(async () => (await window.pwnotes.notes.create({ title: "Survives crash" })).note!.id);
  const pid = await pwnotes.killCore("SIGKILL");
  expect(pid).toBeGreaterThan(1);
  await expect.poll(async () => { try { const state = await pwnotes.core(); process.kill(state.pid, 0); return state.pid; } catch { return pid; } }, { timeout: 30_000 }).not.toBe(pid);
  await expect.poll(() => page.evaluate(async id => (await window.pwnotes.notes.get({ id })).note?.title, id).catch(() => "unavailable"), { timeout: 30000 }).toBe("Survives crash");
  await expect(page.getByText("Core offline", { exact: true })).toHaveCount(0);
});

test("closing the last window leaves the detached core alive", async ({ pwnotes }) => {
  await pwnotes.skipOnboarding();
  const state = await pwnotes.core();
  await pwnotes.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.close()));
  await expect.poll(() => pwnotes.app.windows().length).toBe(0);
  process.kill(state.pid, 0);
  const response = await fetch(`${state.endpoint}/notes.v1.HealthService/Check`, { method: "POST", headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" }, body: "{}" });
  expect(response.ok).toBe(true);
});
