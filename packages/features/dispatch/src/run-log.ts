/** A piece of a run's log: the agent's own words (Markdown), or a line the core recorded. */
export type RunLogSegment =
  | { kind: "text"; text: string }
  | { kind: "event"; event: string; text: string };

const EVENT_LINE = /^\[([a-z][a-z_-]*)\] (.*)$/;

/**
 * Splits a run's log into the agent's response, kept whole so its Markdown renders, and the
 * `[kind] text` lines the core adds between them. Lines inside a code fence stay text.
 */
export function splitRunLog(log: string): RunLogSegment[] {
  const segments: RunLogSegment[] = [];
  let text: string[] = [];
  let fenced = false;
  const flush = () => {
    const joined = text.join("\n").trim();
    if (joined) segments.push({ kind: "text", text: joined });
    text = [];
  };
  for (const line of log.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const event = fenced ? null : EVENT_LINE.exec(line);
    if (event) {
      flush();
      segments.push({ kind: "event", event: event[1]!, text: event[2]!.trim() });
    } else {
      text.push(line);
    }
  }
  flush();
  return segments;
}
