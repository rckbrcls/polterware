import type { DispatchTierView } from "./dispatch-types";

/** The routing tiers, in board column order. */
export const TIER_COLUMNS = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
] as const;

/** A board cell: a tier column and a 0-based order row (row 0 is the primary candidate). */
export type TierSlot = { tier: string; index: number };

/** What a card carries, from the board or from the model palette. */
export type TierCardInput = Pick<DispatchTierView, "agent" | "model" | "provider" | "speed" | "strength">;

/** Candidates of each tier, ordered by position. */
export function tierColumns(tiers: readonly DispatchTierView[]): Record<string, DispatchTierView[]> {
  const columns: Record<string, DispatchTierView[]> = {};
  for (const column of TIER_COLUMNS) columns[column.id] = [];
  for (const tier of tiers) (columns[tier.name] ??= []).push(tier);
  for (const list of Object.values(columns)) list.sort((a, b) => a.position - b.position);
  return columns;
}

function flatten(columns: Record<string, DispatchTierView[]>): DispatchTierView[] {
  const order = [...TIER_COLUMNS.map((column) => column.id as string), ...Object.keys(columns).filter((id) => !TIER_COLUMNS.some((column) => column.id === id))];
  return order.flatMap((name) => (columns[name] ?? []).map((tier, position) => ({ ...tier, name, position })));
}

/**
 * Places a card at a slot and shifts the cards below it down. With `from`, the card moves
 * (it leaves its old slot first); without it, the card is new. A new card whose agent and
 * model are already in the target tier is refused, and the table comes back unchanged.
 */
export function placeTierCard(
  tiers: readonly DispatchTierView[],
  card: TierCardInput,
  to: TierSlot,
  from?: TierSlot,
): DispatchTierView[] {
  const columns = tierColumns(tiers);
  const target = (columns[to.tier] ??= []);
  if (!from && target.some((item) => item.agent === card.agent && item.model === card.model)) return [...tiers];
  if (from) {
    const source = columns[from.tier];
    if (!source?.[from.index]) return [...tiers];
    source.splice(from.index, 1);
  }
  const index = Math.max(0, Math.min(to.index, target.length));
  target.splice(index, 0, { name: to.tier, position: index, agent: card.agent, model: card.model, provider: card.provider, speed: card.speed, strength: card.strength });
  return flatten(columns);
}

/** Removes the card at a slot. */
export function removeTierCard(tiers: readonly DispatchTierView[], slot: TierSlot): DispatchTierView[] {
  const columns = tierColumns(tiers);
  columns[slot.tier]?.splice(slot.index, 1);
  return flatten(columns);
}
