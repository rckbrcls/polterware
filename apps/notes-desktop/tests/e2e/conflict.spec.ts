import { test, expect } from "../fixtures";

test("retains the local draft on a real revision conflict and offers Reload and Overwrite", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  const id = await page.evaluate(async () => (await window.pwnotes.notes.create({ title: "Conflict fixture" })).note!.id);
  await page.evaluate(id => window.pwnotes.app.openDeepLink(`pwnotes://note/${id}`), id);
  const title = page.locator("[data-note-title]");
  await expect(title).toHaveValue("Conflict fixture");
  // Edit and advance the persisted revision in one renderer turn, before the debounce saves.
  await title.evaluate(async (input: HTMLInputElement, id) => {
    input.value = "Local draft";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await window.pwnotes.notes.update({ id, title: "Agent revision" });
  }, id);
  await title.press("Meta+s");
  await expect(page.getByRole("alert").filter({ hasText: "Edit conflict" })).toContainText("Edit conflict");
  await expect(title).toHaveValue("Local draft");
  await expect(page.getByRole("button", { name: "Overwrite", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(title).toHaveValue("Agent revision");
});
