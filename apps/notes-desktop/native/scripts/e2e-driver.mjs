import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--") && all[index + 1]) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const db = args.db, bin = args.bin, app = args.app, code = args.code;
const notify = args.notify, inspect = args.inspect, result = args.result, userdata = args.userdata;
const electronPid = Number(args["electron-pid"]);
const inspectUserdata = `${args.workdir}/inspect-userdata`;
const secret = "E2E_SECRET_NOTE_DO_NOT_LOG";
const titlePrefix = "[Polterware Notes E2E TEST]";
const logPath = `${dirname(db)}/run/notify.log`;
const statePath = `${dirname(db)}/run/core.json`;
const hookPath = `${dirname(db)}/run/e2e-hook`;
const fail = (message) => {
  if (existsSync(logPath)) {
    console.error("--- notify.log ---");
    console.error(readFileSync(logPath, "utf8"));
  }
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try { if (predicate()) return resolve(undefined); } catch { /* still waiting */ }
      if (Date.now() - start > timeoutMs) reject(new Error(label));
      else setTimeout(tick, 100);
    };
    tick();
  });
}
function connect(path, body = {}) {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  return fetch(`${state.endpoint}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok || json.code) throw new Error(`${path} ${response.status} ${json.code || json.message || text}`.trim());
    return json;
  });
}
function inspectNative(command) {
  const envPath = `${args.workdir}/inspect-cmd-env.json`;
  writeFileSync(envPath, JSON.stringify({
    PWNOTES_CORE_BIN: bin,
    PWNOTES_CORE_DB: db,
    PWNOTES_NOTIFY_E2E: "1",
    PWNOTES_NOTIFY_MODULE: notify,
    PWNOTES_NOTIFY_INSPECT: command,
    PWNOTES_NOTIFY_INSPECT_RESULT: result,
  }));
  execFileSync(app, [code, `--user-data-dir=${inspectUserdata}`, "--", `--notes-e2e-env=${envPath}`], { timeout: 25_000 });
  return JSON.parse(readFileSync(result, "utf8"));
}
function logLines() {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
function lastRefresh(reason) {
  return logLines().filter((row) => row.event === "refreshed" && (!reason || row.reason === reason)).at(-1);
}
function clickAllow() {
  const script = `
    with timeout of 1 seconds
      tell application "System Events"
        repeat with procName in {"Electron", "Polterware Notes"}
          try
            tell process procName
              set frontmost to true
              try
                click button "Allow" of window 1
              end try
            end tell
          end try
        end repeat
      end tell
    end timeout
  `;
  try { execFileSync("osascript", ["-e", script], { timeout: 2_500 }); } catch { /* prompt may be absent */ }
}
async function waitQuiet() {
  let count = logLines().length;
  for (let i = 0; i < 20; i++) {
    await delay(700);
    const next = logLines().length;
    if (next === count) return;
    count = next;
  }
}
function stopElectronTree(pid) {
  try { process.kill(pid); } catch { /* already gone */ }
  try { execFileSync("pkill", ["-f", code]); } catch { /* already gone */ }
}

await waitFor(() => existsSync(statePath), 40_000, "core.json not written; Electron did not start the real core");
const health = await connect("/notes.v1.HealthService/Check");
if (!health.dbPath || realpathSync(health.dbPath) !== realpathSync(db)) fail(`Health dbPath mismatch: ${health.dbPath}`);
console.log(`core health build=${health.build} db=${health.dbPath}`);
await waitFor(() => logLines().some((row) => row.event === "delegate-installed"), 10_000, "delegate was not installed");

clickAllow();
try {
  await waitFor(() => {
    clickAllow();
    return Boolean(lastRefresh()) || logLines().some((row) => row.event === "refresh-failed");
  }, 15_000, "no reminder refresh after start");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
if (!lastRefresh()) {
  const permission = (await connect("/notes.v1.ReminderService/Status")).permission || "unknown";
  fail(`notification permission is ${permission}; native did not arm`);
}
const status = await connect("/notes.v1.ReminderService/Status");
if (!["authorized", "provisional"].includes(status.permission)) {
  fail(`notification permission is ${status.permission || "unknown"}`);
}

const now = Date.now();
const ids = [];
for (let i = 0; i < 200; i++) {
  const created = await connect("/notes.v1.NoteService/Create", {
    title: `${titlePrefix} budget-${String(i).padStart(3, "0")}`,
    content: `${secret} extra markdown that must never appear in notify.log ${"x".repeat(80)}`,
  });
  const id = created.note.id;
  ids.push(id);
  await connect("/notes.v1.ScheduleService/Set", {
    schedule: { noteId: id, active: true, fireAt: new Date(now + (i + 30) * 60_000).toISOString(), tz: "UTC" },
  });
}
await waitQuiet();
const plan = await connect("/notes.v1.ReminderService/Plan", { now: new Date().toISOString(), budget: 60 });
if (plan.items.length > 60) fail(`Plan returned ${plan.items.length} items`);
const armed = lastRefresh()?.armed ?? 0;
if (armed > 60) fail(`armed ${armed} exceeds Budget 60`);
if (plan.items.some((item) => /:(?:repeat|wd\d+)$/.test(item.id))) fail("Plan serialized a native repeat as a one-shot");
console.log(`budget pass: planned=${plan.items.length} armed=${armed}`);

const daily = await connect("/notes.v1.NoteService/Create", { title: `${titlePrefix} open-ended-daily`, content: secret });
await connect("/notes.v1.ScheduleService/Set", {
  schedule: { noteId: daily.note.id, active: true, fireAt: new Date(now - 3600_000).toISOString(), tz: "UTC", freq: "daily", every: 1 },
});
const bounded = await connect("/notes.v1.NoteService/Create", { title: `${titlePrefix} bounded-daily`, content: secret });
await connect("/notes.v1.ScheduleService/Set", {
  schedule: {
    noteId: bounded.note.id, active: true, fireAt: new Date(now + 120_000).toISOString(),
    tz: "UTC", freq: "daily", every: 1, endType: "until", untilAt: new Date(now + 3 * 86400_000).toISOString(),
  },
});
await waitQuiet();
const afterRepeat = await connect("/notes.v1.ReminderService/Plan", { now: new Date().toISOString(), budget: 60 });
if (afterRepeat.items.some((item) => /:(?:repeat|wd\d+)$/.test(item.id))) fail("open-ended daily leaked as a one-shot");
if (afterRepeat.items.some((item) => item.noteId === daily.note.id)) fail("open-ended daily armed as a one-shot");
if (!afterRepeat.items.some((item) => item.noteId === bounded.note.id && /:\d+$/.test(item.id))) {
  fail("bounded daily did not arm as one-shot occurrences");
}
console.log(`repeat gap pass: open-ended omitted, bounded one-shots=${afterRepeat.items.filter((item) => item.noteId === bounded.note.id).length}`);

await waitQuiet();
const editedAt = Date.now();
await connect("/notes.v1.ScheduleService/Set", {
  schedule: { noteId: ids[0], active: true, fireAt: new Date(now + 90_000).toISOString(), tz: "UTC" },
});
await waitFor(() => {
  const row = lastRefresh("change");
  return Boolean(row && Date.parse(row.at) >= editedAt);
}, 2_000, "schedule edit did not re-arm within 2s");
const rearmMs = Date.parse(lastRefresh("change").at) - editedAt;
if (rearmMs > 2000) fail(`schedule re-arm took ${rearmMs} ms`);
console.log(`schedule edit re-arm ${rearmMs} ms`);

writeFileSync(hookPath, "timezone");
await waitFor(() => lastRefresh("timezone"), 3_000, "timezone hook did not re-plan");
console.log("timezone re-plan pass");

const soon = await connect("/notes.v1.NoteService/Create", { title: `${titlePrefix} fire-closed`, content: secret });
const fireAt = new Date(Date.now() + 8_000).toISOString();
await connect("/notes.v1.ScheduleService/Set", {
  schedule: { noteId: soon.note.id, active: true, fireAt, tz: "UTC" },
});
await waitFor(() => lastRefresh("change") && Date.parse(lastRefresh("change").at) >= Date.parse(soon.note.createdAt || 0), 5_000, "soon one-shot was not armed");
const logText = readFileSync(logPath, "utf8");
if (logText.includes(secret)) fail("notify.log contains note content");
if (/Bearer |core\.json/i.test(logText)) fail("notify.log contains secrets");

const corePid = JSON.parse(readFileSync(statePath, "utf8")).pid;
stopElectronTree(electronPid);
await waitFor(() => { try { process.kill(electronPid, 0); return false; } catch { return true; } }, 5_000, "Electron did not exit");
process.kill(corePid, 0);
await delay(10_000);
const delivered = inspectNative("delivered");
if (!delivered.ok) fail(`delivered inspect failed: ${delivered.error}`);
const hit = (delivered.delivered || []).find((row) => String(row.title || "").includes("fire-closed"));
if (!hit) fail(`closed-Electron delivery missing; delivered=${JSON.stringify(delivered.delivered)}`);
console.log(`closed-electron delivery pass: ${hit.id}`);

const hiddenStart = Date.now();
const hiddenEnv = `${args.workdir}/hidden-env.json`;
writeFileSync(hiddenEnv, JSON.stringify({
  PWNOTES_CORE_BIN: bin,
  PWNOTES_CORE_DB: db,
  PWNOTES_NOTIFY_E2E: "1",
  PWNOTES_NOTIFY_MODULE: notify,
}));
execFileSync(app, [code, `--user-data-dir=${userdata}`, "--", `--notes-e2e-env=${hiddenEnv}`, "--background-replan"], { timeout: 25_000 });
if (!lastRefresh("start") || Date.parse(lastRefresh("start").at) < hiddenStart) fail("hidden replan did not refresh");
const hiddenMs = Date.now() - hiddenStart;
try { process.kill(corePid, 0); } catch { fail("core exited when Electron idle-quit"); }
console.log(`hidden replan idle-exit ${hiddenMs} ms; core still running pid=${corePid}`);

inspectNative("cleanup");
const leftover = inspectNative("pending");
const leftoverDelivered = inspectNative("delivered");
if ((leftover.pending || []).length) fail(`pending leftovers: ${JSON.stringify(leftover.pending)}`);
if ((leftoverDelivered.delivered || []).length) fail(`delivered leftovers: ${JSON.stringify(leftoverDelivered.delivered)}`);
console.log("cleanup pass: pending=0 delivered=0");
