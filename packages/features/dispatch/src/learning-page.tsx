import { For, createMemo, createSignal, onMount } from "solid-js";
import {
  Card,
  Cpu,
  DataTable,
  PageContent,
  PageEmpty,
  ProgressBar,
  StatusChip,
  pushToast,
} from "@polterware/frontend-design-system";
import { dispatchBridge, mapDispatchClassifier } from "./dispatch-bridge";
import type { DispatchClassifierTierView, DispatchClassifierView } from "./dispatch-types";

const EXCLUDED_FEATURES = new Set(["bias", "tier_easy", "tier_normal", "tier_hard"]);

type FailureFeatureRow = {
  feature: string;
  weight: number;
};

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

export function DispatchLearningPage() {
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
  const allOnPrior = createMemo(() =>
    classifier().tiers.every((tier) => tier.samples < minSamples()),
  );

  return (
    <PageContent class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <Card class="flex flex-wrap items-center justify-between gap-2 p-4">
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2 text-[13px] font-medium text-[var(--color-text-primary)]">
            <Cpu size={15} />
            <span>Tier failure classifier (schema v{classifier().featureSchema})</span>
          </div>
          <p class="m-0 text-[12px] leading-5 text-[var(--color-text-secondary)]">
            {allOnPrior()
              ? `Cold start: weights stay on the prior until a tier has ${minSamples()} verified samples.`
              : `Weights update after ${minSamples()} verified samples.`}
          </p>
        </div>
        <StatusChip
          tone={allOnPrior() ? "muted" : "ok"}
          label={allOnPrior() ? "On prior" : "Active learning"}
        />
      </Card>

      <div class="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <For each={classifier().tiers}>
          {(tier: DispatchClassifierTierView) => {
            const onPrior = () => tier.samples < minSamples();
            const progress = () => {
              const goal = minSamples();
              if (goal <= 0) return 0;
              return Math.min(100, Math.max(0, (tier.samples / goal) * 100));
            };
            const rows = createMemo(() =>
              topFailureFeatures(classifier().featureNames, tier.weights),
            );
            return (
              <Card class="flex h-full min-w-0 flex-col gap-3 p-4">
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <span class="truncate text-[13px] font-semibold capitalize text-[var(--color-text-primary)]">
                    {tier.tier}
                  </span>
                  <div class="flex shrink-0 items-center gap-2">
                    <div
                      class="inline-flex items-center gap-1.5"
                      title={`${tier.samples} of ${minSamples()} verified samples`}
                    >
                      <ProgressBar
                        label={`${tier.tier} verified samples`}
                        value={progress()}
                        aria-valuetext={`${tier.samples} of ${minSamples()} verified samples`}
                        size="sm"
                        class="w-14"
                      />
                      <span class="font-mono text-[11px] tabular-nums text-[var(--color-text-secondary)]">
                        {tier.samples}/{minSamples()}
                      </span>
                    </div>
                    <StatusChip
                      tone={onPrior() ? "muted" : "ok"}
                      label={onPrior() ? "Prior" : "Learned"}
                    />
                  </div>
                </div>

                <DataTable.Root
                  class="min-w-0"
                  rows={rows()}
                  getRowId={(row) => row.feature}
                  virtualized={false}
                >
                  <DataTable.Table aria-label={`${tier.tier} failure features`}>
                    <DataTable.Header>
                      <DataTable.ColumnHeader<FailureFeatureRow>
                        id="feature"
                        class="[&_.pw-data-table-sort-trigger]:!pl-0"
                        sortBy={(row) => row.feature}
                      >
                        Feature
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<FailureFeatureRow>
                        id="weight"
                        align="right"
                        resizable={false}
                        width="5.5rem"
                        minWidth={88}
                        maxWidth={96}
                        sortBy={(row) => row.weight}
                      >
                        Weight
                      </DataTable.ColumnHeader>
                    </DataTable.Header>
                    <DataTable.Body<FailureFeatureRow>>
                      {(row) => (
                        <DataTable.Row row={row} rowId={row.feature}>
                          <DataTable.Cell>
                            <span class="font-mono text-[12px]">{row.feature}</span>
                          </DataTable.Cell>
                          <DataTable.Cell align="right">
                            <span class="font-mono text-[12px] tabular-nums">
                              +{row.weight.toFixed(2)}
                            </span>
                          </DataTable.Cell>
                        </DataTable.Row>
                      )}
                    </DataTable.Body>
                    <DataTable.Empty>
                      <PageEmpty
                        title="No positive failure weights"
                        description="No features currently raise predicted failure."
                      />
                    </DataTable.Empty>
                  </DataTable.Table>
                </DataTable.Root>
              </Card>
            );
          }}
        </For>
      </div>
    </PageContent>
  );
}
