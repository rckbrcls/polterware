import { test, expect } from "../fixtures";

test("map: offline tiles make no map request and keep the place list", async ({ pwnotes, page }) => {
  const requests: string[] = [];
  page.on("request", request => { requests.push(request.url()); });
  await page.getByRole("button", { name: "Skip onboarding", exact: true }).click();
  await page.evaluate(async () => {
    await window.pwnotes.settings.set({ keys: ["map.online"], settings: { mapOnline: false } });
  });
  const created = await page.evaluate(async () => {
    const id = (await window.pwnotes.notes.create({ title: "Wire place fixture" })).note?.id;
    if (!id) throw new Error("Note fixture was not created");
    await window.pwnotes.places.set({ place: { noteId: id, name: "Fixture place", lat: 0, lng: 0, radiusM: 200, event: "enter", active: true } });
    return id;
  });
  await page.evaluate(() => window.pwnotes.app.openDeepLink("pwnotes://map"));
  // The first-run dialog makes the background main/navigation inert.
  const disclosure = page.getByRole("dialog", { name: "Map tiles and places" });
  await expect(disclosure.getByText("Places do not trigger notifications in v1.")).toBeVisible();
  await disclosure.getByRole("button", { name: "Keep tiles off", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-label", "Map");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("aria-label", "Map");
  await expect(page.getByText("Map tiles are off")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Places" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Places" })).toContainText("Wire place fixture");
  await page.evaluate(id => window.pwnotes.app.openDeepLink(`pwnotes://note/${id}`), created);
  await expect(page.locator("#place-name")).toBeVisible();
  await expect(page.locator("#place-address")).toHaveCount(0);
  const mapRequests = requests.filter(url => /openfreemap|nominatim\.openstreetmap|protomaps|tile\.openstreetmap/.test(url));
  expect(mapRequests, `unexpected map network: ${mapRequests.join(", ")}`).toEqual([]);
  // Turning geocoding on changes Main's CSP and reloads the renderer.
  const reloaded = page.waitForEvent("load");
  await page.evaluate(() => window.pwnotes.settings.set({ keys: ["map.geocoding"], settings: { mapGeocoding: true } })).catch(error => {
    if (!/context was destroyed/i.test(String(error))) throw error;
  });
  await reloaded;
  await page.evaluate(id => window.pwnotes.app.openDeepLink(`pwnotes://note/${id}`), created);
  await expect(page.locator("#place-address")).toBeVisible();
  await expect(page.getByText(/typed address text to Nominatim/)).toBeVisible();
  expect(requests.filter(url => /nominatim\.openstreetmap/.test(url))).toEqual([]);

});
