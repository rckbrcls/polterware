import { isOwnedIdentifier } from "./plan";
export function isBackgroundReminderLaunch(argv: readonly string[], launchInfo?: unknown): boolean {
  if (argv.includes("--background-replan")) return true;
  if (!launchInfo || typeof launchInfo !== "object") return false;
  const info = launchInfo as Record<string, unknown>;
  // Electron's ready launchInfo NotificationResponse; do not invent argv flags.
  return typeof info.identifier === "string" && isOwnedIdentifier(info.identifier) && typeof info.actionIdentifier === "string";
}
