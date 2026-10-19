import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Polterware Notes } from "../fixtures";
const run = promisify(execFile);
export async function inspectNative(pwnotes: Polterware Notes, command: "pending" | "delivered") {
  const resultPath = join(pwnotes.directory, `${command}-result.json`);
  const environmentFile = join(pwnotes.directory, `${command}-environment.json`);
  await writeFile(environmentFile, JSON.stringify({ PWNOTES_CORE_DB: pwnotes.database, PWNOTES_NOTIFY_INSPECT: command, PWNOTES_NOTIFY_INSPECT_RESULT: resultPath }), { mode: 0o600 });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith("PWNOTES_") && key !== "ELECTRON_RUN_AS_NODE")) as Record<string, string>;
  await run(process.env.PWNOTES_E2E_EXECUTABLE!, [`--user-data-dir=${join(pwnotes.directory, `inspect-${command}`)}`, `--notes-e2e-env=${environmentFile}`], { env, timeout: 15000 });
  return JSON.parse(await readFile(resultPath, "utf8")) as { ok: boolean; pending?: { id: string }[]; delivered?: { id: string }[] };
}
