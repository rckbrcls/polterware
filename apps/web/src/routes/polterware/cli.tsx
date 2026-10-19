import { For } from "solid-js";
import { LinkButton, ArrowRight02Icon } from "@polterware/frontend-design-system";
import { Seo } from "../../components/Seo";
import { ClosingCta, Feature, Hero, NextLink, Showcase, Statement } from "../../components/Sections";
import { CliTerminalMockup } from "../../components/mockups/CliTerminalMockup";
import { CLI, REPO_URL, products } from "../../data/products";

const polterText = `---
polter: 1
summary: Import git metadata as evidence
rationale: Facts should cite the commit that backs them
---

## git-import: Git metadata import
stage: build · owner: erick · decisions: ADR-0007

- [x] T1 Upsert commit evidence \`backend/import/*\`
- [ ] T2 Stamp revision on facts
? Include merge commits? [blocking] (yes | no)
! No network calls during scan`;

function PolterFile() {
  return (
    <div class="mk-terminal" role="img" aria-label="A Polter text file that writes a Work card">
      <div class="mk-titlebar"><span class="mk-dots"><i /><i /><i /></span><span class="mk-title">plan.pw.md</span></div>
      <pre class="mk-code">{polterText}</pre>
    </div>
  );
}

const commands: Array<[string, string]> = [
  [`${CLI}`, "Status TUI for the current project"],
  [`${CLI} status`, "Current card, branch, last handoff, open questions"],
  [`${CLI} query cards`, "One line per Work card"],
  [`${CLI} apply plan.pw.md`, "Write cards from Polter text"],
  [`${CLI} task claim slug#T2`, "Claim a task before editing"],
  [`${CLI} verify slug`, "Check a card against its contract"],
  [`${CLI} handoff --note "…"`, "End a session for the next one"],
  [`${CLI} setup claude`, "Install the plugin for Claude Code or Codex"],
  [`${CLI} mcp`, "MCP bridge for any agent"],
  [`${CLI} serve`, "The local core every client attaches to"],
];

export default function CliPage() {
  return (
    <main id="main" tabindex="-1">
      <Seo title="Polterware CLI" description={products.cli.summary} path="/polterware/cli" />
      <Hero
        eyebrow="Polterware CLI"
        title={<>Polterware, where your<br />agents already work</>}
        lead="One binary for the terminal: a status TUI, commands for scripts and agents, an MCP bridge, and the local core that keeps your project database."
        actions={<>
          <LinkButton variant="primary" href="/polterware#install">Install with Polterware</LinkButton>
          <LinkButton variant="ghost" href={`${REPO_URL}#readme`} target="_blank" rel="noopener noreferrer">Read the guide<ArrowRight02Icon size={16} /></LinkButton>
        </>}
        aside={<span class="hero-status">{products.cli.status}</span>}
      />
      <Showcase><CliTerminalMockup title={`~/code/polterware — ${CLI}`} /></Showcase>

      <Statement
        eyebrow="ONE CORE, MANY CLIENTS"
        strong="The desktop, the TUI and your agents share one process."
        rest="A single local core opens the database; everything else attaches to it, so what an agent writes is what you see."
      />

      <Feature index="2.1" eyebrow="AGENTS" title="Set up Claude Code or Codex in one command."
        body="The plugin teaches your agent the Polter format, starts each session with status, and ends it with a handoff. Agents without a plugin attach over MCP."
        points={["Compiled context sized for the task", "Audited writes on the same path as yours", "Drift checks against your decisions"]}
        visual={<CliTerminalMockup session="agents" />} />
      <Feature index="2.2" eyebrow="POLTER" title="Work cards as plain text." reverse
        body="Agents write Markdown that Polterware understands: cards, tasks, open questions, invariants and decisions. Lint it, dry-run it, apply it. The store stays the source of truth."
        visual={<PolterFile />} />

      <section class="commands site-container" aria-labelledby="commands-title">
        <p class="eyebrow mono">2.3 COMMANDS</p>
        <h2 id="commands-title">Everything from the terminal.</h2>
        <dl class="command-grid">
          <For each={commands}>{([command, detail]) => (
            <div><dt><code>{command}</code></dt><dd>{detail}</dd></div>
          )}</For>
        </dl>
      </section>

      <section class="next-row site-container">
        <NextLink href={products.polterware.href} detail="Desktop" label="Polterware" />
        <NextLink href={products.vitals.href} detail="Companion" label="Polterware Vitals" />
      </section>

      <ClosingCta title="Bring your agents into the loop."
        body="The binary is bundled with the Polterware app and builds from source in the repo. Then run setup for your agent."
        actions={<LinkButton variant="primary" href="/polterware#install">Install Polterware</LinkButton>} />
    </main>
  );
}
