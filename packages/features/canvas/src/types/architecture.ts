import type { StoreEntity } from "../references";
import { genericBehavior, type CanvasBehavior } from "./shared";

export function structureEntities(entities: readonly StoreEntity[]): StoreEntity[] {
  return entities.filter((entity) => entity.kind === "node" && ["system", "domain", "component"].includes(entity.level ?? ""));
}
export const architecture: CanvasBehavior = {
  ...genericBehavior, structureReferences: true,
  edgeStyle: (kind) => ({ arrow: true, dashed: kind === "contains" }),
};
