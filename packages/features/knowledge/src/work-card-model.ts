/** What the core reads about a Work card beyond the card itself: its gates, verification, handoff, runs, and brief. */
export type CardGateCheck = { step: string; severity: "error" | "hint"; message: string };
export type CardVerifyCheck = { status: "pass" | "fail" | "info" | "manual"; message: string };
export type CardVerification = { passed: boolean; checks: CardVerifyCheck[] };
export type CardHandoff = { branch: string; goal: string; done: string; inProgress: string; next: string; agent: string; at: string };
export type CardRun = { id: string; status: string; agent: string; model: string; prompt: string; at: string };

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(obj) : []);
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The gate an open stage passes next: an idea passes the contract into Planned, a planned card passes the plan into In progress. */
export function nextGate(stage: string): { step: "contract" | "plan"; target: string; label: string } | undefined {
  if (stage === "shape") return { step: "contract", target: "plan", label: "Move to Planned" };
  if (stage === "plan") return { step: "plan", target: "build", label: "Start work" };
  return undefined;
}

/** The review's checks that bear on the next gate: a card in shape also sees its shape hints. */
export function gateChecks(raw: unknown, stage: string): CardGateCheck[] {
  const steps = stage === "shape" ? ["shape", "contract"] : stage === "plan" ? ["plan"] : [];
  return list(obj(obj(raw).review).checks)
    .map((check) => ({ step: text(check.step), severity: text(check.severity) === "error" ? "error" as const : "hint" as const, message: text(check.message) }))
    .filter((check) => check.message && steps.includes(check.step));
}

export function mapVerification(raw: unknown): CardVerification {
  const record = obj(raw);
  const statuses = new Set(["pass", "fail", "info", "manual"]);
  return {
    passed: record.passed === true,
    checks: list(record.checks).map((check) => {
      const status = text(check.status);
      return { status: (statuses.has(status) ? status : "info") as CardVerifyCheck["status"], message: text(check.message) };
    }).filter((check) => check.message),
  };
}

/** The newest handoff written for this card, if any. */
export function latestHandoff(raw: unknown, slug: string): CardHandoff | undefined {
  const handoffs = list(obj(raw).handoffs).filter((handoff) => text(handoff.slug) === slug);
  handoffs.sort((a, b) => text(b.at).localeCompare(text(a.at)));
  const newest = handoffs[0];
  if (!newest) return undefined;
  return {
    branch: text(newest.branch), goal: text(newest.goal), done: text(newest.done),
    inProgress: text(newest.inProgress), next: text(newest.next), agent: text(newest.agent), at: text(newest.at),
  };
}

/** The dispatch runs that name this card, newest first. */
export function cardRuns(raw: unknown, slug: string): CardRun[] {
  return list(obj(raw).runs)
    .filter((run) => text(run.cardSlug) === slug)
    .map((run) => ({
      id: text(run.id), status: text(run.status), agent: text(run.agent), model: text(run.model),
      prompt: text(run.prompt), at: text(run.startedAt) || text(run.createdAt),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
