import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createNotifyLog } from "./log";
it("logs only the approved metadata projection with 0600 permissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "notes-notify-log-"));
  try {
    const log = createNotifyLog(directory);
    const payload = { armed: 60, reason: "change" as const, token: "secret", body: "private note", title: "private title", error: "Bearer secret" };
    log("refreshed", payload);
    const filename = join(directory, "run/notify.log"), output = readFileSync(filename, "utf8");
    expect(output).not.toMatch(/secret|private|Bearer|token|title|body/);
    expect(JSON.parse(output)).toMatchObject({ event: "refreshed", reason: "change", armed: 60 });
    expect(statSync(filename).mode & 0o777).toBe(0o600);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
