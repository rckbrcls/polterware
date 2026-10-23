import type { FeatureQuestionRoute, WorkspaceFeatureReview } from "@polterware/feature-shell";
import { asBoolean, asObjectArray, asRecord, asString, asStringArray } from "./format";
import { mapWorkCards } from "./map-records";

const ROUTES: FeatureQuestionRoute[] = ["inbox", "deferred", "delegated", "answered"];
const STEPS = ["shape", "contract", "plan"] as const;

/** Feature review from WorkService.ReviewFeature / CreateFeature / AdvanceFeature. */
export function mapFeatureReview(raw: Record<string, unknown>): WorkspaceFeatureReview | null {
  const cardRaw = asRecord(raw.card);
  if (!asString(cardRaw.slug)) return null;
  const [card] = mapWorkCards([cardRaw]);
  return {
    card,
    underPath: asString(raw.underPath),
    underTitle: asString(raw.underTitle),
    suggested: asStringArray(raw.suggested),
    touches: asObjectArray(raw.touches).map((touch) => ({
      path: asString(touch.path),
      level: asString(touch.level),
      title: asString(touch.title),
    })),
    decisions: asObjectArray(raw.decisions).map((decision) => ({
      ref: asString(decision.ref),
      id: asString(decision.id),
      title: asString(decision.title),
      status: asString(decision.status),
      from: asString(decision.from),
    })),
    inherited: asObjectArray(raw.inherited).map((invariant) => ({
      text: asString(invariant.text),
      from: asString(invariant.from),
    })),
    questions: asObjectArray(raw.questions).map((question) => {
      const route = asString(question.route) as FeatureQuestionRoute;
      return {
        id: asString(question.id),
        text: asString(question.text),
        blocking: asBoolean(question.blocking),
        options: asStringArray(question.options),
        route: ROUTES.includes(route) ? route : "inbox",
        answer: asString(question.answer),
      };
    }),
    checks: asObjectArray(raw.checks).flatMap((check) => {
      const step = asString(check.step);
      if (!STEPS.includes(step as (typeof STEPS)[number])) return [];
      return [{
        step: step as (typeof STEPS)[number],
        severity: asString(check.severity) === "error" ? "error" as const : "hint" as const,
        message: asString(check.message),
      }];
    }),
  };
}

/**
 * Gate refusals arrive as one Connect message, "line 0: a; line 0: b".
 * Split it into one line per diagnostic without the generated line numbers.
 */
export function gateErrorLines(message: string): string[] {
  const body = message.replace(/^\[[a-z_]+\]\s*/, "");
  return body
    .split(/;\s+(?=line \d+: )/)
    .map((part) => part.replace(/^line \d+:\s*/, "").trim())
    .filter((part) => part.length > 0);
}
