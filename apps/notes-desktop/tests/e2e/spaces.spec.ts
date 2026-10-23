import { test, expect } from "../fixtures";

test("create, rename, and delete a Space with cascade confirmation", async ({ pwnotes, page }) => {
  await page.getByRole("button", { name: "Skip onboarding", exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Spaces", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "Create Space", exact: true }).first().click();
  await page.getByLabel("Name").fill("Playwright Space");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("main").getByRole("button", { name: /Playwright Space/ })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: /Playwright Space/ }).click();
  await expect(page.getByRole("heading", { name: "Playwright Space" })).toBeVisible();
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.getByRole("complementary", { name: "Sidebar", exact: true }).getByRole("treeitem", { name: /Playwright Space/ }).click();
  await expect(page.getByRole("heading", { name: "Playwright Space", exact: true })).toBeVisible();
  await page.getByLabel("Name").fill("Updated Space");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Space" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  await expect(page.getByLabel("Move to", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Space notes", exact: true }).getByRole("button", { name: "New note", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Add child Space", exact: true }).first().click();
  const createChild = page.getByRole("dialog", { name: "Create Space", exact: true });
  await createChild.getByLabel("Name", { exact: true }).fill("Child Space");
  await createChild.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Child Spaces", exact: true })).toBeVisible();
  const noteId = await page.evaluate(async () => {
    const child = (await window.pwnotes.spaces.list({})).spaces?.find(space => space.name === "Child Space");
    if (!child?.id) throw new Error("Child Space missing");
    return (await window.pwnotes.notes.create({ title: "Cascade note", spaceId: child.id })).note?.id;
  });
  await page.getByRole("button", { name: "Delete Space" }).click();
  await expect(page.getByText("Deletes 1 child Spaces; 1 notes move to Inbox.", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete Space" }).click();
  await expect(page.getByRole("heading", { name: "Spaces", level: 1, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async id => (await window.pwnotes.notes.get({ id: id! })).note?.spaceId ?? "", noteId)).toBe("");
});
