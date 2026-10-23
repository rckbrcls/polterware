import { test, expect } from "../fixtures";

import { driver } from "../helpers/driver";

for (const transport of ["stdio", "http"] as const) {
  test(`agent ${transport} SDK write invalidates the open window`, async ({ pwnotes, page }) => {
    await pwnotes.skipOnboarding();
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    await page.evaluate(() => window.pwnotes.settings.set({ keys: ["agents.mcpEnabled"], settings: { agentsMcpEnabled: true } }));
    const title = `Agent ${transport} note`;
    const result = await driver(pwnotes, transport, title);
    expect(result.isError ?? false).toBe(false);
    await expect(page.getByRole("main")).toContainText(title);
    const persisted = await page.evaluate(async query => (await window.pwnotes.notes.list({ query })).notes, title);
    expect(persisted).toHaveLength(1);
  });
}
