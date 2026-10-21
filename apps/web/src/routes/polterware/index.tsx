import { For } from "solid-js";
import { LinkButton, ArrowRight02Icon, StatusChip, type StatusTone } from "@polterware/frontend-design-system";
import { Seo } from "../../components/Seo";
import { ClosingCta, Feature, Hero, InstallCommand, NextLink, Showcase, Statement } from "../../components/Sections";
import { PolterwareAppMockup } from "../../components/mockups/PolterwareAppMockup";
import { CliTerminalMockup } from "../../components/mockups/CliTerminalMockup";
import { RELEASES_URL, installCommand, products } from "../../data/products";

/** Small code-built panels for the Truth, Atlas and Activity sections. */
function TruthPanel() {
  const decisions: Array<[string, StatusTone, string]> = [
    ["Principle", "ok", "Every write goes through the local core"],
    ["Active", "ok", "Verdict-012 · Bearer session token, no accounts"],
    ["Challenged", "warn", "Verdict-009 · One SQLite database per project"],
    ["Proposed", "syncing", "Verdict-015 · Split the importer by source kind"],
  ];
  return (
    <div class="mk-panel" role="img" aria-label="Decisions with lifecycle states">
      <For each={decisions}>{([state, tone, title]) => (
        <div class="mk-row"><StatusChip tone={tone}>{state}</StatusChip><div class="mk-row-copy"><strong>{title}</strong></div></div>
      )}</For>
      <div class="mk-evidence">
        <span class="mono">EVIDENCE</span>
        <span>backend/core/serve.go</span><span>docs/runbooks/release.md</span><span>schemas/work.proto</span>
      </div>
    </div>
  );
}

function AtlasPanel() {
  const nodes = [
    { label: "Polterware", kind: "system", x: 50, y: 14 },
    { label: "Work", kind: "domain", x: 20, y: 48 },
    { label: "Truth", kind: "domain", x: 50, y: 48 },
    { label: "Atlas", kind: "domain", x: 80, y: 48 },
    { label: "Importer", kind: "component", x: 35, y: 82 },
    { label: "Drift", kind: "component", x: 65, y: 82 },
  ];
  const edges = ([[0, 1], [0, 2], [0, 3], [2, 4], [2, 5], [1, 5]] as const).map(([a, b]) => [nodes[a]!, nodes[b]!] as const);
  return (
    <div class="mk-panel mk-atlas" role="img" aria-label="Atlas map of systems, domains and components">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <For each={edges}>{([a, b]) => <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vector-effect="non-scaling-stroke" />}</For>
      </svg>
      <For each={nodes}>{(node) => (
        <span class={`mk-node mk-node-${node.kind}`} style={{ left: `${node.x}%`, top: `${node.y}%` }}>{node.label}<em>{node.kind}</em></span>
      )}</For>
    </div>
  );
}

function ActivityPanel() {
  const events: Array<[string, string, string]> = [
    ["claude", "Moved W-41 Import pipeline to Verify", "rationale: tests cover all source kinds"],
    ["you", "Pinned principle “Local core owns SQLite”", "from Decision Verdict-004"],
    ["codex", "Added evidence to Fact F-18", "backend/core/lock.go"],
    ["you", "Resolved drift on Verdict-012", "middleware updated"],
  ];
  return (
    <div class="mk-panel" role="img" aria-label="Unified change history">
      <For each={events}>{([who, what, why]) => (
        <div class="mk-event"><span class="mk-avatar">{who.charAt(0).toUpperCase()}</span><div class="mk-row-copy"><strong>{what}</strong><span>{who} · {why}</span></div></div>
      )}</For>
    </div>
  );
}

export default function PolterwarePage() {
  return (
    <main id="main" tabindex="-1">
      <Seo title="Polterware" description={products.polterware.summary} path="/polterware" />
      <Hero
        eyebrow="Polterware"
        title={<>The shared memory<br />of your codebase</>}
        lead="Work, decisions, facts and evidence in one local store. People and coding agents read the same state, and Polterware flags where code drifts from what you decided."
        actions={<>
          <LinkButton variant="primary" href="#install">Download for macOS</LinkButton>
          <LinkButton variant="ghost" href="/polterware/cli">Use it from the terminal<ArrowRight02Icon size={16} /></LinkButton>
        </>}
        aside={<span class="hero-status">{products.polterware.status}</span>}
      />
      <Showcase><PolterwareAppMockup /></Showcase>

      <Statement
        eyebrow="HOW IT WORKS"
        strong="Declare intent, attach evidence, catch drift."
        rest="Polterware imports your project's sources, keeps decisions and facts next to the files that back them, and checks every change against them."
      />

      <Feature index="1.1" eyebrow="INBOX" title="Only what needs a person."
        body="A flat list derived from your project: open questions on Work cards, drift findings, and facts that still lack evidence. The count follows you to the sidebar and the CLI."
        points={["Decision: open questions agents could not answer", "Drift: warnings and conflicts with your decisions", "Verify: facts with no evidence yet"]}
        visual={<PolterwareAppMockup view="inbox" />} />
      <Feature index="1.2" eyebrow="WORK" title="Cards from Shape to Delivered." reverse
        body="Work cards move through Shape, Plan, Build, Verify and Delivered. Agents write them as plain Polter text; the store stays the source of truth."
        points={["Board by stage and a Specs table of the same cards", "Every change carries a summary and a rationale"]}
        visual={<PolterwareAppMockup view="board" />} />
      <Feature index="1.3" eyebrow="TRUTH" title="Decisions with a lifecycle."
        body="Verdicts move between Proposed, Active, Challenged and Superseded. Principles apply to the whole project and stay pinned. Facts list the evidence behind them."
        visual={<TruthPanel />} />
      <Feature index="1.4" eyebrow="ATLAS" title="A map of what you are building." reverse
        body="Systems, domains and components, with the Work cards that touch each one. Resources are components, not a separate inventory."
        visual={<AtlasPanel />} />
      <Feature index="1.5" eyebrow="ACTIVITY" title="Every change, with its reason."
        body="One history of justified changes across every surface, filterable by person or agent. You can always see who changed what, and why."
        visual={<ActivityPanel />} />
      <Feature index="1.6" eyebrow="AGENTS" title="Context on a budget, writes on the record." reverse
        body="Agents attach through MCP or the CLI, read compiled context sized for the task, and write through the same audited path you do."
        visual={<CliTerminalMockup session="agents" />} />

      <section id="install" class="install-section site-container" aria-labelledby="install-title">
        <p class="eyebrow mono">INSTALL</p>
        <h2 id="install-title">Install Polterware</h2>
        <p>Alpha builds for macOS on Apple Silicon. Run the same command again to update. macOS asks for confirmation on first open.</p>
        <InstallCommand command={installCommand("polterware")} />
        <a class="text-link" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">All releases<ArrowRight02Icon size={14} /></a>
      </section>

      <section class="next-row site-container">
        <NextLink href={products.cli.href} detail="Next" label="Polterware CLI" />
        <NextLink href={products.vitals.href} detail="Companion" label="Polterware Vitals" />
      </section>

      <ClosingCta title="Give your agents a memory."
        body="Import your project, pin your principles, and let every session start from what is already true."
        actions={<LinkButton variant="primary" href="#install">Download Polterware</LinkButton>} />
    </main>
  );
}
