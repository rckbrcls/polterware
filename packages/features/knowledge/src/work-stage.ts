import type { StatusTone } from "@polterware/frontend-design-system";
import type { WorkStage, WorkspaceWorkCard } from "@polterware/feature-shell";

export const WORK_STAGES: readonly { id: WorkStage; label: string }[] = [
  { id: "shape", label: "Idea" },
  { id: "plan", label: "Planned" },
  { id: "build", label: "In progress" },
  { id: "verify", label: "In review" },
  { id: "delivered", label: "Done" },
];

export function isWorkStage(value: string): value is WorkStage {
  return WORK_STAGES.some((stage) => stage.id === value);
}

export function workStageLabel(stage: WorkStage): string {
  return WORK_STAGES.find((item) => item.id === stage)?.label ?? stage;
}

export function workStageTone(stage: WorkStage): StatusTone {
  if (stage === "delivered") return "healthy";
  if (stage === "verify") return "syncing";
  if (stage === "build") return "ok";
  return "muted";
}

/** Done vs total tasks; dropped tasks do not count. */
export function cardTaskProgress(card: WorkspaceWorkCard): { done: number; total: number } {
  const live = card.tasks.filter((task) => task.state !== "dropped");
  return { done: live.filter((task) => task.state === "done").length, total: live.length };
}

export function cardOpenQuestions(card: WorkspaceWorkCard): number {
  return card.questions.filter((question) => question.state === "open").length;
}
