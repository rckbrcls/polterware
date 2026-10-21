import { Code, ConnectError } from "@connectrpc/connect";
import { BadRequestSchema } from "@polterware/notes-contracts";

const PUBLIC_NAME = "PublicIpcError";

function violationText(error: ConnectError): string | undefined {
  try {
    const reasons = error.findDetails(BadRequestSchema)
      .flatMap(detail => detail.violations ?? [])
      .map(item => item.reason.trim())
      .filter(Boolean);
    if (reasons.length) return [...new Set(reasons)].join("; ");
  } catch { /* Unknown detail types stay off the public message. */ }
  return undefined;
}

function sanitizeMessage(raw: string): string {
  return (raw.split(/\r?\n/)[0] ?? raw)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(?:[A-Za-z]:)?(?:\/|\\)(?:Users|home|private|var|tmp|Applications|Library)\b.*/gi, "[path]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Renderer-safe Error: field violations in message, no stacks or internal paths. */
export function publicIpcError(error: unknown): Error {
  if (error instanceof Error && error.name === PUBLIC_NAME) return error;
  let message = "Request failed";
  if (error instanceof ConnectError) {
    const violations = error.code === Code.InvalidArgument ? violationText(error) : undefined;
    const fallback = sanitizeMessage(error.rawMessage || error.message);
    message = violations || fallback || message;
  } else if (error instanceof Error) {
    message = sanitizeMessage(error.message) || message;
  } else if (typeof error === "string") {
    message = sanitizeMessage(error) || message;
  }
  const result = new Error(message);
  result.name = PUBLIC_NAME;
  return result;
}
