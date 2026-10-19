import { test, expect } from "../fixtures";

test("shell: Enter and Space activate native buttons and Save schedule preserves note status", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  for (const key of ["Enter", "Space"]) {
    await page.getByRole("button", { name: "Open Commander", exact: true }).press(key);
    await expect(page.getByRole("dialog", { name: "Commander", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator("[data-floating-window-toggle]").press(key);
    await expect(page.getByRole("region", { name: "New note", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "New note", exact: true }).first().press("Enter");
  await page.getByLabel("Title", { exact: true }).fill("Keyboard schedule");
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.locator("[data-note-title]")).toHaveValue("Keyboard schedule");
  const schedule = page.locator("[data-schedule-card]");
  await schedule.getByLabel("Start date").fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await schedule.getByRole("button", { name: "Save schedule", exact: true }).press("Space");
  await expect(schedule.getByText("Live", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await window.pwnotes.notes.list({ query: "Keyboard schedule" })).notes?.[0]?.status)).toBe("active");
});

test("shell: keyboard navigation, Commander quick add, real core, and global details", async ({ pwnotes, page }) => {
  await expect(page.getByRole("dialog", { name: "Welcome to Polterware Notes" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable notifications", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("does not arm a reminder");
  await expect(page.getByRole("dialog")).not.toContainText(/Reminders: \d+ armed/);
  await page.getByRole("button", { name: "Skip onboarding", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-label", "Today");
  await expect(page.getByText("Connecting…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Core offline", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Meta+1");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Inbox", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Meta+[");
  await expect(page.getByRole("main")).toHaveAttribute("aria-label", "Today");
  await page.keyboard.press("Meta+k");
  await page.getByLabel("Search or command", { exact: true }).fill("new note");
  await page.getByRole("dialog").getByRole("button", { name: "New note", exact: true }).click();
  const title = `Shell smoke ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(`${title} tomorrow 9am #shell-smoke !!`);
  await page.getByRole("region", { name: "New note", exact: true }).getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-note-title]")).toHaveValue(title);
  const notes = await page.evaluate(async (query) => {
    const result = await window.pwnotes.notes.list({ query });
    return result;
  }, title);
  expect(notes).toMatchObject({ total: 1, notes: [expect.objectContaining({ title, priority: 2 })] });
  await page.keyboard.press("Meta+j");
  await page.keyboard.press("Meta+,");
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
});
