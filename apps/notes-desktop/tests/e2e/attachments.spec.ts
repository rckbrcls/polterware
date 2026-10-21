import { test, expect } from "../fixtures";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";

async function openInboxNote(page: Page, title: string) {
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  const id = await page.evaluate(async title => (await window.pwnotes.notes.create({ title })).note!.id, title);
  await page.evaluate(id => window.pwnotes.app.openDeepLink(`pwnotes://note/${id}`), id);
  await expect(page.locator("[data-attachments-section]")).toBeVisible();
  return id;
}

test("imports 20 mixed files through pickFiles and never uses file:// previews", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  const files = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const ext = index === 0 ? "png" : index === 1 ? "webm" : "txt";
    const path = join(pwnotes.directory, `mix-${String(index).padStart(2, "0")}.${ext}`);
    await writeFile(path, ext === "png" ? Buffer.from("89504e470d0a1a0a", "hex") : `file ${index}`);
    return path;
  }));
  await pwnotes.app.evaluate(async ({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, files);
  const noteId = await openInboxNote(page, "Attachment import");
  await page.getByRole("button", { name: "Add attachment", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add file", exact: true }).click();
  await expect(page.locator("[data-attachments-section]").getByText("Live", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async id => (await window.pwnotes.attachments.list({ noteId: id })).attachments?.length, noteId)).toBe(20);
  const previewUrls = await page.locator("[data-preview-url]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-preview-url") ?? ""));
  expect(previewUrls.length).toBeGreaterThan(0);
  expect(previewUrls.every(url => url.startsWith("pwnotes-file://attachment/"))).toBe(true);
  expect(await page.locator("[src^='file:']").count()).toBe(0);
});

test("drag-drop import uses a real drop and granted paths", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  const noteId = await openInboxNote(page, "Attachment drop");
  const zone = page.locator("[data-drop-zone]");
  await expect(zone).toBeVisible();
  const path = join(pwnotes.directory, "drop.txt");
  await writeFile(path, "dropped");
  await zone.scrollIntoViewIfNeeded();
  const box = await zone.boundingBox();
  expect(box).toBeTruthy();
  const session = await page.context().newCDPSession(page);
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const data = { items: [{ mimeType: "Files", data: path }], files: [path], dragOperationsMask: 1 };
  await session.send("Input.dispatchDragEvent", { type: "dragEnter", ...point, data });
  await session.send("Input.dispatchDragEvent", { type: "dragOver", ...point, data });
  await session.send("Input.dispatchDragEvent", { type: "drop", ...point, data });
  await expect(page.getByText("drop.txt")).toBeVisible();
  await expect(page.locator("[data-attachments-section]").getByText("Live", { exact: true })).toBeVisible();
  const listed = await page.evaluate(async (id) => window.pwnotes.attachments.list({ noteId: id }), noteId);
  expect(listed.attachments?.some(item => item.name === "drop.txt")).toBe(true);
  expect(await page.locator("[src^='file:']").count()).toBe(0);
  await expect(page.getByText(/no filesystem path/)).toHaveCount(0);
});

test("denied microphone permission is shown honestly", async ({ pwnotes, page }) => {
  await pwnotes.skipOnboarding();
  await openInboxNote(page, "Attachment mic");
  await pwnotes.app.evaluate(({ systemPreferences }) => {
    systemPreferences.askForMediaAccess = async () => false;
  });
  await page.getByRole("button", { name: "Add attachment", exact: true }).click();
  await page.getByRole("menuitem", { name: "Record audio", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Microphone permission denied. Grant access in System Settings to record audio." })).toBeVisible();
});
