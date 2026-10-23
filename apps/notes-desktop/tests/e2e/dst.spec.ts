import { test, expect } from "../fixtures";

test("daily recurring series preserves local 09:00 across the spring DST boundary", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  const rows = await page.evaluate(async () => {
    const note = (await window.pwnotes.notes.create({ title: "DST series" })).note!;
    await window.pwnotes.schedule.set({ schedule: { noteId: note.id, active: true, fireAt: "2026-03-07T14:00:00Z", tz: "America/New_York", freq: "daily", every: 1, endType: "count", occurrenceCount: 3 } });
    return (await window.pwnotes.schedule.listOccurrences({ from: "2026-03-07T00:00:00Z", to: "2026-03-10T00:00:00Z", includeCompleted: true })).occurrences;
  });
  expect((rows ?? []).map(row => row.occurrenceAt)).toEqual(["2026-03-07T14:00:00Z", "2026-03-08T13:00:00Z", "2026-03-09T13:00:00Z"]);
  expect((rows ?? []).every(row => row.tz === "America/New_York")).toBe(true);
});
