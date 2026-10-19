import { LinkButton, ArrowRight02Icon } from "@polterware/frontend-design-system";
import { Seo } from "../components/Seo";
import { ClosingCta, Feature, FigureRow, Hero, NextLink, Showcase, Statement } from "../components/Sections";
import { FigureBlocks, FigureLayers, FigurePlanes } from "../components/Figures";
import { PolterwareAppMockup } from "../components/mockups/PolterwareAppMockup";
import { CliTerminalMockup } from "../components/mockups/CliTerminalMockup";
import { VitalsMockup } from "../components/mockups/VitalsMockup";
import { products } from "../data/products";

export default function Home() {
  return (
    <main id="main" tabindex="-1">
      <Seo
        title="polterware"
        description="Polterware keeps one evidence-backed picture of your project that people and coding agents share, and flags drift from what you decided."
        path="/"
      />
      <Hero
        title={<>Project context<br />your agents can trust</>}
        lead={<>Polterware keeps one evidence-backed picture of your project.<br class="hide-mobile" /> People and coding agents read the same state, and drift gets flagged.</>}
        actions={<>
          <LinkButton variant="primary" href="/polterware#install">Download Polterware</LinkButton>
          <LinkButton variant="ghost" href="/polterware">See how it works<ArrowRight02Icon size={16} /></LinkButton>
        </>}
        aside={<a class="hero-new" href="/polterware/cli"><strong>New</strong> Polterware CLI <ArrowRight02Icon size={14} /></a>}
      />
      <Showcase><PolterwareAppMockup /></Showcase>

      <Statement
        eyebrow="BUILT FOR THE AGENT ERA"
        strong="Your agents forget. Your project shouldn't."
        rest="Polterware turns decisions, facts and evidence into a local record that every session starts from, so the next change is grounded in what is already true."
      />
      <FigureRow items={[
        { figure: <FigureLayers />, title: "Local-first", body: "One local core per project database. Your work never leaves the machine unless you send it." },
        { figure: <FigureBlocks />, title: "Evidence-backed", body: "Every fact lists the sources that back it. Unbacked claims land in the Inbox to verify." },
        { figure: <FigurePlanes />, title: "Shared with agents", body: "Claude Code, Codex and you read the same context and write through the same audited path." },
      ]} />

      <Feature
        index="1.0"
        eyebrow="POLTERWARE"
        title="Decide once. Keep every agent on it."
        body="Inbox collects what needs a person: open questions on Work cards, drift from your decisions, facts without evidence. Answer them once and every agent reads the answer."
        points={["Inbox for decisions, drift and verification", "Work cards from Shape to Delivered", "Atlas of systems, domains and components"]}
        visual={<PolterwareAppMockup view="board" />}
      />
      <Feature
        index="2.0"
        eyebrow="POLTERWARE CLI"
        title="The same context, from the terminal."
        body="A TUI for browsing, commands for scripts, and an MCP bridge so agents read compiled context and write audited changes."
        points={["Plugin setup for Claude Code and Codex", "Work cards written as plain Polter text", "Session status and handoff in one command"]}
        visual={<CliTerminalMockup />}
        reverse
      />
      <Feature
        index="3.0"
        eyebrow="VITALS"
        title="And a quiet eye on your machines."
        body="Polterware Vitals is a small companion: connect over SSH to see CPU, memory, disks, network and processes, then open a terminal on the host."
        visual={<VitalsMockup />}
      />

      <section class="next-row site-container">
        <NextLink href={products.polterware.href} detail="Desktop" label="Polterware" />
        <NextLink href={products.cli.href} detail="Terminal" label="Polterware CLI" />
        <NextLink href={products.vitals.href} detail="Companion" label="Polterware Vitals" />
      </section>

      <ClosingCta
        title="Start with what is already true."
        body="Polterware is in alpha for macOS on Apple Silicon. Import your project, pin your principles, and let your agents catch up."
        actions={<>
          <LinkButton variant="primary" href="/polterware#install">Download Polterware</LinkButton>
          <LinkButton variant="ghost" href="/polterware/cli">Explore the CLI</LinkButton>
        </>}
      />
    </main>
  );
}
