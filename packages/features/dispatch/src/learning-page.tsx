import { For, Show, createMemo, createSignal, onMount, type JSX } from "solid-js";
import {
  CreditCard,
  DataTable,
  Database,
  KeyRound,
  Layers,
  PageContent,
  PageEmpty,
  Shield,
  StatusChip,
  Zap,
  matchClauses,
  pushToast,
  type FilterClause,
} from "@polterware/frontend-design-system";
import { dispatchBridge, mapDispatchClassifier } from "./dispatch-bridge";
import type { DispatchClassifierView } from "./dispatch-types";

const EXCLUDED_FEATURES = new Set(["bias", "tier_easy", "tier_normal", "tier_hard"]);

type FailureFeatureRow = {
  feature: string;
  weight: number;
};

/** A failure feature with its positive weight in each tier that weighs it. */
type FeatureRow = { feature: string; weights: Record<string, number> };

/** A feature's icon, read from its risk keyword. */
function featureIcon(feature: string): JSX.Element {
  if (feature.includes("auth")) return <KeyRound size={14} aria-hidden />;
  if (feature.includes("security")) return <Shield size={14} aria-hidden />;
  if (feature.includes("money")) return <CreditCard size={14} aria-hidden />;
  if (feature.includes("migration")) return <Layers size={14} aria-hidden />;
  if (feature.includes("data")) return <Database size={14} aria-hidden />;
  return <Zap size={14} aria-hidden />;
}

function defaultClassifier(): DispatchClassifierView {
  return {
    featureSchema: 1,
    minSamples: 5,
    featureNames: [],
    tiers: [
      { tier: "easy", samples: 0, weights: [] },
      { tier: "normal", samples: 0, weights: [] },
      { tier: "hard", samples: 0, weights: [] },
    ],
  };
}

function topFailureFeatures(
  featureNames: readonly string[],
  weights: readonly number[],
): FailureFeatureRow[] {
  const rows: FailureFeatureRow[] = [];
  const count = Math.min(featureNames.length, weights.length);
  for (let index = 0; index < count; index += 1) {
    const feature = featureNames[index] ?? "";
    const weight = weights[index] ?? 0;
    if (!feature || EXCLUDED_FEATURES.has(feature) || weight <= 0) continue;
    rows.push({ feature, weight });
  }
  rows.sort((a, b) => (b.weight !== a.weight ? b.weight - a.weight : a.feature.localeCompare(b.feature)));
  return rows;
}

export function DispatchLearningPage(props: {
  /** Matches feature names and tier names. */
  query?: string;
  /** Filter clauses over `tier` and `state` ("Prior" or "Learned"). */
  clauses?: readonly FilterClause[];
} = {}) {
  const [classifier, setClassifier] = createSignal<DispatchClassifierView>(defaultClassifier());

  const load = async () => {
    const bridge = dispatchBridge();
    if (!bridge) {
      setClassifier(defaultClassifier());
      return;
    }
    try {
      const raw = await bridge.getClassifier({});
      setClassifier(mapDispatchClassifier(raw));
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load classifier state.", "danger");
    }
  };

  onMount(() => void load());

  const minSamples = () => classifier().minSamples || 5;
  const needle = () => (props.query ?? "").trim().toLowerCase();
  const visibleTiers = createMemo(() => classifier().tiers.filter((tier) => {
    const state = tier.samples < minSamples() ? "Prior" : "Learned";
    return matchClauses(tier, props.clauses ?? [], { tier: (item) => item.tier, state: () => state });
  }));

  // One row per failure feature any visible tier weighs; a tier name match keeps every row.
  const rows = createMemo((): FeatureRow[] => {
    const names = classifier().featureNames;
    const weights = new Map<string, Record<string, number>>();
    for (const tier of visibleTiers()) {
      for (const row of topFailureFeatures(names, tier.weights)) {
        weights.set(row.feature, { ...weights.get(row.feature), [tier.tier]: row.weight });
      }
    }
    const tierMatch = visibleTiers().some((tier) => needle() && tier.tier.toLowerCase().includes(needle()));
    return [...weights.entries()]
      .filter(([feature]) => !needle() || tierMatch || feature.toLowerCase().includes(needle()))
      .map(([feature, byTier]) => ({ feature, weights: byTier }));
  });

  return (
    <PageContent class="flex min-h-0 flex-1 flex-col overflow-auto p-3">
      <Show
        when={visibleTiers().length > 0 && rows().length > 0}
        fallback={<PageEmpty title={visibleTiers().length > 0 ? "Nothing risky" : "No matches"} mood={visibleTiers().length > 0 ? "sleeping" : "lost"} />}
      >
        <DataTable.Root rows={rows()} getRowId={(row) => row.feature} columnWidthsKey="dispatch-learning" density="list">
          <DataTable.Table aria-label="Failure feature weights">
            <DataTable.Header>
              <DataTable.ColumnHeader<FeatureRow> id="feature" width="34%" minWidth={220} sortBy={(row) => row.feature}>Failure feature</DataTable.ColumnHeader>
              <For each={visibleTiers()}>
                {(tier) => {
                  const onPrior = () => tier.samples < minSamples();
                  return (
                    <DataTable.ColumnHeader<FeatureRow> id={`tier-${tier.tier}`} align="right" sortBy={(row) => row.weights[tier.tier] ?? 0}>
                      <span class="inline-flex items-center gap-2">
                        <span class="capitalize">{tier.tier}</span>
                        <span class="tabular-nums text-[var(--color-text-muted)]" title={`${tier.samples} of ${minSamples()} verified samples`}>
                          {tier.samples}/{minSamples()}
                        </span>
                        <StatusChip tone={onPrior() ? "muted" : "ok"} label={onPrior() ? "Prior" : "Learned"} />
                      </span>
                    </DataTable.ColumnHeader>
                  );
                }}
              </For>
            </DataTable.Header>
            <DataTable.Body<FeatureRow>>
              {(row) => (
                <DataTable.Row row={row} rowId={row.feature} aria-label={row.feature}>
                  <DataTable.PrimaryCell icon={featureIcon(row.feature)} iconTone="neutral" iconSeed={row.feature} title={<span class="font-mono">{row.feature}</span>} />
                  <For each={visibleTiers()}>
                    {(tier) => (
                      <DataTable.Cell align="right">
                        <Show when={row.weights[tier.tier] !== undefined} fallback={<span class="text-[var(--color-text-muted)]">—</span>}>
                          <span class="font-mono tabular-nums text-[var(--color-text-primary)]">+{row.weights[tier.tier]!.toFixed(2)}</span>
                        </Show>
                      </DataTable.Cell>
                    )}
                  </For>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      </Show>
    </PageContent>
  );
}
