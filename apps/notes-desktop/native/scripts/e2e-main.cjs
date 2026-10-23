const fs = require("node:fs");
const path = require("node:path");
const envArg = process.argv.find((arg) => arg.startsWith("--notes-e2e-env="));
const envPath = envArg?.slice("--notes-e2e-env=".length) || "";
const marker = path.join(envPath ? path.dirname(envPath) : (process.env.TMPDIR || "/tmp"), "main-boot.txt");
function boot(text) {
  try { fs.writeFileSync(marker, text); } catch { /* Isolated e2e diagnostics only. */ }
}
boot(`boot argv=${process.argv.join(" ")}\n`);
if (!envPath || !path.isAbsolute(envPath)) {
  boot("boot-failed missing absolute --notes-e2e-env");
  process.exit(1);
}
const parsed = JSON.parse(fs.readFileSync(envPath, "utf8"));
for (const [key, value] of Object.entries(parsed)) {
  if (key.startsWith("PWNOTES_") && typeof value === "string") process.env[key] = value;
}
if (process.env.PWNOTES_NOTIFY_E2E === "1") {
  const isolated = process.env.PWNOTES_CORE_DB || "";
  if (!path.isAbsolute(isolated) || !isolated.includes("notes-w1-native-notify")) {
    boot("boot-failed e2e PWNOTES_CORE_DB must be an isolated temp database");
    process.exit(1);
  }
}
import("./out/main/index.js").catch((error) => {
  boot(`boot-failed ${error.stack || error}`);
  console.error(error);
  process.exit(1);
});
