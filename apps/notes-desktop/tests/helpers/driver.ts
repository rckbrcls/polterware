import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { Polterware Notes } from "../fixtures";
const run = promisify(execFile);
export async function driver(pwnotes: Polterware Notes, mode: "stdio" | "http" | "seed", title = "Agent note", count = 10000) {
  const { stdout } = await run(resolve("tests/build/e2edriver"), ["-mode", mode, "-db", pwnotes.database, "-binary", resolve("../../dist/pwnotes"), "-title", title, "-count", String(count)], { timeout: 600_000 });
  return JSON.parse(stdout);
}
