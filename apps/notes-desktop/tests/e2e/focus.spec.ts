import { test, expect } from "../fixtures";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("focus: start, pause, skip, reset, and Commander Start focus", async ({ pwnotes, page }) => {
  await page.getByRole("button", { name: "Skip onboarding", exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-label", "Focus");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Quick focus", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Short break", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await page.keyboard.press("Meta+k");
  await page.getByLabel("Search or command", { exact: true }).fill("Start focus");
  await page.getByRole("dialog").getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const recorded = await page.evaluate(async () => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    return window.pwnotes.focus.listSessions({ from: from.toISOString(), to: new Date().toISOString() });
  });
  expect((recorded.sessions ?? []).length).toBeGreaterThan(0);
});
