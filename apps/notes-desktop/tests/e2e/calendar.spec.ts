import { test, expect } from "../fixtures";

test("create a note by clicking an empty calendar slot", async ({ pwnotes, page }) => {
  await page.getByRole("button", { name: "Skip onboarding", exact: true }).click().catch(() => {});
  await page.evaluate(() => window.pwnotes.settings.set({ keys: ["calendar.weekStart"], settings: { calendarWeekStart: "sun" } }));
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator("[data-calendar]")).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.evaluate(async () => (await window.pwnotes.settings.get({})).settings?.calendarWeekStart)).toBe("sun");
  await page.getByRole("button", { name: /Add at 09:00/ }).first().click();
  await expect(page.locator("[data-note-title]")).toHaveValue("Untitled note");
  const persisted = await page.evaluate(async () => {
    const bridge = (window as unknown as { pwnotes: { schedule: { listOccurrences(input: object): Promise<{ occurrences: { title: string; tz: string }[] }> } } }).pwnotes;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return bridge.schedule.listOccurrences({ from: from.toISOString(), to: to.toISOString(), includeCompleted: true });
  });
  expect(persisted.occurrences.some(item => item.title === "Untitled note")).toBe(true);
  expect(persisted.occurrences.find(item => item.title === "Untitled note")?.tz).toBeTruthy();
});

test("calendar: roving focus, native toolbar arrows and Enter activation", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const calendar = page.locator("[data-calendar]");
  const main = page.getByRole("main");
  const grid = page.locator(".notes-calendar__grid-wrap");
  await expect(calendar).toHaveAttribute("data-calendar-view", "week");
  await expect.poll(() => grid.locator("button").evaluateAll(buttons => buttons.filter(button => (button as HTMLButtonElement).tabIndex === 0).length)).toBe(1);
  const first = calendar.getByRole("button", { name: /Add at 09:00/ }).first();
  const date = await first.getAttribute("data-slot-date");
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toHaveAttribute("data-slot-time", "10:00");
  await expect(page.locator(":focus")).toHaveAttribute("data-slot-date", date!);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(":focus")).toHaveAttribute("data-slot-time", "10:00");
  await expect(page.locator(":focus")).not.toHaveAttribute("data-slot-date", date!);
  const range = await calendar.getAttribute("data-calendar-from");
  await main.getByRole("button", { name: "Next", exact: true }).press("ArrowRight");
  await expect(calendar).toHaveAttribute("data-calendar-from", range!);
  await main.getByRole("tab", { name: "Week", exact: true }).press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(calendar).toHaveAttribute("data-calendar-view", "month");
  await main.getByRole("tab", { name: "Day", exact: true }).press("Space");
  await calendar.getByRole("button", { name: /Add at 09:00/ }).press("Enter");
  await expect(page.locator("[data-note-title]")).toHaveValue("Untitled note");
  await page.keyboard.press("Meta+j");
  const occurrence = grid.locator("[data-occurrence]").first();
  await expect(occurrence).toBeVisible();
  await occurrence.focus();
  await page.keyboard.press("ArrowDown");
  await expect(occurrence).not.toBeFocused();
  await occurrence.press("Enter");
  await expect(page.locator("[data-note-title]")).toHaveValue("Untitled note");
});
