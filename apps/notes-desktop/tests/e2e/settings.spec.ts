import { test, expect } from "../fixtures";

test("settings: Map Tiles and App Map select distinct panels", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "Tiles", exact: true }).click();
  await expect(settings.locator("[data-map-settings]")).toBeVisible();
  await settings.getByRole("button", { name: "Map", exact: true }).click();
  await expect(settings.getByRole("checkbox", { name: "Address search", exact: true })).toBeVisible();
  await expect(settings.getByLabel("Map provider", { exact: true })).toBeVisible();
  await expect(settings.locator("[data-map-settings]")).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Tiles", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(settings.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-current", "page");
  await settings.getByRole("button", { name: "Tiles", exact: true }).click();
  await expect(settings.locator("[data-map-settings]")).toBeVisible();
});

test("settings: round-trip, MCP off test, and token rotation against the real core", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "General", exact: true }).click();
  const keepRunning = settings.getByRole("checkbox", { name: /Keep running in background/ });
  const before = await keepRunning.isChecked();
  await keepRunning.press("Space");
  await expect.poll(() => page.evaluate(async () => (await window.pwnotes.settings.get({})).settings?.appKeepRunningInBackground ?? false)).toBe(!before);

  await settings.getByRole("button", { name: "Access", exact: true }).click();
  const enabled = settings.getByRole("checkbox", { name: "Enable MCP", exact: true });
  if (await enabled.isChecked()) await enabled.press("Space");
  await expect.poll(() => page.evaluate(async () => (await window.pwnotes.settings.get({})).settings?.agentsMcpEnabled ?? false)).toBe(false);
  await settings.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(settings).toContainText("MCP is disabled. Enable it in Settings → Agents, then test again.");

  await enabled.press("Space");
  await expect.poll(() => page.evaluate(async () => (await window.pwnotes.settings.get({})).settings?.agentsMcpEnabled)).toBe(true);
  const previous = await page.evaluate(async () => (await window.pwnotes.agents.getInfo({})).token);
  await settings.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(settings).toContainText("Previous token is no longer valid");
  const next = await page.evaluate(async () => (await window.pwnotes.agents.getInfo({})).token);
  expect(next).not.toBe(previous);

  await settings.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Open logs", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Open logs", exact: true }).click();
  await expect(settings).toContainText("Log revealed in Finder.");
  await settings.getByRole("button", { name: "Open data folder", exact: true }).click();
  await expect(settings).toContainText("Data folder revealed in Finder.");
  const transparency = settings.getByRole("checkbox", { name: "Reduce transparency", exact: true });
  const oldTransparency = await page.evaluate(() => window.pwnotes.app.getReduceTransparency());
  await transparency.press("Space");
  await expect.poll(() => page.evaluate(() => window.pwnotes.app.getReduceTransparency())).toBe(!oldTransparency);
  await expect(settings).toContainText("Automatic launch at login is unavailable in this build.");
  const violation = await page.evaluate(async () => {
    try { await window.pwnotes.settings.set({ keys: ["calendar.weekStart"], settings: { calendarWeekStart: "invalid" } }); return "unexpected success"; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  });
  expect(violation).toContain("must be mon or sun");

  await settings.getByRole("button", { name: "Search", exact: true }).click();
  await expect(settings).toContainText("Search matches words in your notes.");
  await expect(settings).toContainText("Semantic search is unavailable.");
});
