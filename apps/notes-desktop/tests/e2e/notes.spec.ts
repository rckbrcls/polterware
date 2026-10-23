import { test, expect } from "../fixtures";

test("virtualized notes render core rows and scroll to the last note", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  await pwnotes.seed(120);
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(page.getByText("Live · 120 notes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sort notes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Title", exact: true }).click();
  await expect(page.locator("[data-row-id]").first()).toBeVisible();
  const count = await page.locator("[data-row-id]").count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(100);
  await page.locator('.pw-data-table-scroll[data-virtualized="true"]').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole("row", { name: "Performance note 00119", exact: true })).toBeVisible();
});

test("keyboard create, edit, pin, complete, undo and delete", async ({ pwnotes, page }, info) => {
  await pwnotes.skipOnboarding();
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "New note", exact: true }).first().focus();
  await expect(page.getByRole("main").getByRole("button", { name: "New note", exact: true }).first()).toBeFocused();
  await page.getByRole("main").getByRole("button", { name: "New note", exact: true }).first().press("Enter");
  const dialog = page.getByRole("dialog", { name: "New note", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill("Keyboard note");
  await dialog.getByRole("button", { name: "Create note" }).press("Space");
  const title = page.locator("[data-note-title]");
  await expect(title).toHaveValue("Keyboard note");
  await title.focus(); await page.keyboard.press("Meta+A"); await page.keyboard.type("Edited note");
  await expect(title).toHaveValue("Edited note");
  await page.keyboard.press("Meta+S");
  await expect(page.getByText("Live · Saved", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await window.pwnotes.notes.list({ inboxOnly: true, limit: 500 })).notes?.[0]?.title)).toBe("Edited note");
  await page.keyboard.press("Meta+J");
  await info.attach("saved-title-and-collection", { body: JSON.stringify(await page.evaluate(async () => ({
    persistedTitles: (await window.pwnotes.notes.list({ inboxOnly: true, limit: 500 })).notes?.map(note => note.title) ?? [],
    renderedRows: [...document.querySelectorAll("[data-row-id]")].map(row => ({ id: row.getAttribute("data-row-id"), name: row.getAttribute("aria-label"), text: row.textContent })),
  }))), contentType: "application/json" });
  const row = page.getByRole("row", { name: "Edited note", exact: true });
  await expect(row).toBeVisible();
  await row.focus(); await page.keyboard.press("p"); await expect(row.getByRole("button", { name: "Pin Edited note" })).toHaveAttribute("aria-pressed", "true");
  await row.focus(); await page.keyboard.press("Space");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeVisible(); await undo.focus(); await page.keyboard.press("Enter");
  await expect(row).toBeVisible();
  await row.focus(); await page.keyboard.press("Meta+Backspace");
  const deleteDialog = page.getByRole("dialog", { name: "Delete selected notes?", exact: true });
  await expect(deleteDialog).toBeVisible();
  // Wait for the focus trap to activate before choosing a different control.
  await expect.poll(() => deleteDialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  const deleteButton = deleteDialog.getByRole("button", { name: "Delete", exact: true });
  await deleteButton.focus(); await expect(deleteButton).toBeFocused(); await page.keyboard.press("Enter");
  await expect(page.getByText(/Deletion queued:/)).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(row).toBeVisible();
  // Verify the persisted title against the real core through the actual preload bridge.
  const persisted = await page.evaluate(async () => {
    const bridge = (window as unknown as { pwnotes: { notes: { list(input: object): Promise<{ notes: { title: string }[] }> } } }).pwnotes;
    return bridge.notes.list({ inboxOnly: true, limit: 500 });
  });
  expect(persisted.notes.some(note => note.title === "Edited note")).toBe(true);
});
