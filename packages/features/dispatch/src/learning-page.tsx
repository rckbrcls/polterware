import { For, Show, createMemo, createSignal, onMount, type JSX } from "solid-js";
import {
  AiBrain01Icon,
  Card,
  CreditCard,
  Database,
  Gauge,
  IconTile,
  KeyRound,
  Layers,
  PageContent,
  PageEmpty,
  ProgressBar,
  Shield,
  StatusChip,
  Zap,
  matchClauses,
  pushToast,
  type FilterClause,
  type IconTileTone,
} from "@polterware/frontend-design-system";
import { dispatchBridge, mapDispatchClassifier } from "./dispatch-bridge";
import type { DispatchClassifierTierView, DispatchClassifierView } from "./dispatch-types";

const EXCLUDED_FEATURES = new Set(["bias", "tier_easy", "tier_normal", "tier_hard"]);

type FailureFeatureRow = {
  feature: string;
  weight: number;
};

const TIER_TONES: Record<string, IconTileTone> = { easy: "integration", normal: "execution", hard: "security" };

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
  const allOnPrior = createMemo(() =>
    classifier().tiers.every((tier) => tier.samples < minSamples()),
  );
  const needle = () => (props.query ?? "").trim().toLowerCase();
  const visibleTiers = createMemo(() => classifier().tiers.filter((tier) => {
    const state = tier.samples < minSamples() ? "Prior" : "Learned";
    return matchClauses(tier, props.clauses ?? [], { tier: (item) => item.tier, state: () => state });
  }));

  return (
    <PageContent class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <Card class="flex flex-wrap items-center justify-between gap-3 p-4">
        <div class="flex min-w-0 items-center gap-3">
          <IconTile size={36} tone="execution" seed="dispatch-classifier" class="shrink-0">
            <AiBrain01Icon size={16} aria-hidden />
          </IconTile>
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-[13px] font-medium text-[var(--color-text-primary)]">
              Tier failure classifier (schema v{classifier().featureSchema})
            </span>
            <p class="m-0 text-[12px] leading-5 text-[var(--color-text-secondary)]">
              {allOnPrior()
                ? `Cold start: weights stay on the prior until a tier has ${minSamples()} verified samples.`
                : `Weights update after ${minSamples()} verified samples.`}
            </p>
          </div>
        </div>
        <StatusChip
          tone={allOnPrior() ? "muted" : "ok"}
          label={allOnPrior() ? "On prior" : "Active learning"}
        />
      </Card>

      <div class="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <For each={visibleTiers()} fallback={<div class="lg:col-span-3"><PageEmpty title="No matches" mood="lost" /></div>}>
          {(tier: DispatchClassifierTierView) => {
            const onPrior = () => tier.samples < minSamples();
            const progress = () => {
              const goal = minSamples();
              if (goal <= 0) return 0;
              return Math.min(100, Math.max(0, (tier.samples / goal) * 100));
            };
            const rows = createMemo(() => {
              const all = topFailureFeatures(classifier().featureNames, tier.weights);
              // A tier name match keeps every row; otherwise the query narrows the features.
              if (!needle() || tier.tier.toLowerCase().includes(needle())) return all;
              return all.filter((row) => row.feature.toLowerCase().includes(needle()));
            });
            const maxWeight = () => Math.max(1e-9, ...rows().map((row) => row.weight));
            return (
              <Card class="flex h-full min-w-0 flex-col gap-4 p-4">
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2.5">
                    <IconTile size={28} tone={TIER_TONES[tier.tier] ?? "neutral"} seed={`dispatch-tier-${tier.tier}`} class="shrink-0">
                      <Gauge size={14} aria-hidden />
                    </IconTile>
                    <div class="flex min-w-0 flex-col">
                      <span class="truncate text-[13px] font-semibold capitalize text-[var(--color-text-primary)]">{tier.tier}</span>
                      <span class="truncate text-[11px] tabular-nums text-[var(--color-text-muted)]">
                        {tier.samples} of {minSamples()} verified samples
                      </span>
                    </div>
                  </div>
                  <StatusChip tone={onPrior() ? "muted" : "ok"} label={onPrior() ? "Prior" : "Learned"} />
                </div>
                <ProgressBar
                  label={`${tier.tier} verified samples`}
                  value={progress()}
                  aria-valuetext={`${tier.samples} of ${minSamples()} verified samples`}
                  size="sm"
                  tone="blue"
                />
                <div class="flex min-w-0 flex-col gap-2">
                  <div class="flex items-center justify-between text-[11px] font-medium text-[var(--color-text-muted)]">
                    <span>Failure features</span>
                    <span>Weight</span>
                  </div>
                  <Show when={rows().length > 0} fallback={<PageEmpty title="Nothing risky" mood="sleeping" />}>
                    <ul class="m-0 flex list-none flex-col gap-5 p-0 pt-1" aria-label={`${tier.tier} failure features`}>
                      <For each={rows()}>
                        {(row) => {
                          return (
                            <li class="flex min-w-0 flex-col gap-1.5">
                              <div class="flex min-w-0 items-center gap-2">
                                <span class="flex text-[var(--color-text-muted)]">{featureIcon(row.feature)}</span>
                                <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--color-text-secondary)]" title={row.feature}>{row.feature}</span>
                                <span class="font-mono text-[12px] tabular-nums text-[var(--color-text-primary)]">+{row.weight.toFixed(2)}</span>
                              </div>
                              <ProgressBar
                                label={`${row.feature} weight`}
                                value={(row.weight / maxWeight()) * 100}
                                aria-valuetext={row.weight.toFixed(2)}
                                size="sm"
                                tone="violet"
                              />
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                  </Show>
                </div>
              </Card>
            );
          }}
        </For>
      </div>
    </PageContent>
  );
}
