import { architecture } from "./architecture";
import { brainstorm } from "./brainstorm";
import { flow } from "./flow";
import { free } from "./free";
import { ideas } from "./ideas";
import { roadmap } from "./roadmap";
import { allowedBehavior, genericBehavior, type CanvasBehavior } from "./shared";
import type { CanvasType } from "../model";

export const canvasTypes: Readonly<Record<string, CanvasBehavior>> = { free, roadmap, flow, architecture, brainstorm, ideas };
export function canvasBehavior(definition: CanvasType) {
  return allowedBehavior(Object.hasOwn(canvasTypes, definition.type) ? canvasTypes[definition.type]! : genericBehavior, definition);
}
