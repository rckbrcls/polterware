import { test, expect } from "../fixtures";

test("configure a daily schedule, preview occurrences, and snooze", async ({ pwnotes, page }) => {
  await page.getByRole("button", { name: "Skip onboarding", exact: true }).click();
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "New note", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "New note", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill("Scheduled note");
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(page.locator("[data-note-title]")).toHaveValue("Scheduled note");
  const card = page.locator("[data-schedule-card]");
  await expect(card).toBeVisible();
  await card.getByLabel("Start date").fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await card.getByRole("button", { name: "Time zone" }).click();
  await page.getByRole("menuitem", { name: /^America\/Sao_Paulo(?: \(system\))?$/ }).click();
  await card.getByRole("button", { name: "Repeat" }).click();
  await page.getByRole("menuitem", { name: "Daily", exact: true }).click();
  await expect(card.locator("[data-schedule-preview] [data-occurrence]")).toHaveCount(5, { timeout: 5000 });
  await card.getByRole("button", { name: "Save schedule" }).click();
  await expect(card.getByText("Live", { exact: true })).toBeVisible();
  await expect.poll(async () => card.locator("[data-reminder-state]").getAttribute("data-reminder-state"), { timeout: 2000 }).not.toBe("notifier off");
  await card.getByRole("button", { name: "Snooze" }).click();
  await expect(card.locator("[data-reminder-state]")).toBeVisible();
});
