import { LinkButton, ArrowRight02Icon } from "@polterware/frontend-design-system";
import { Seo } from "../components/Seo";
import { Feature, Hero, NextLink, Showcase } from "../components/Sections";
import { DispatchMockup } from "../components/mockups/DispatchMockup";
import { products } from "../data/products";

export default function DispatchPage() {
  return (
    <main id="main" tabindex="-1">
      <Seo title="Dispatch" description={products.dispatch.summary} path="/dispatch" />
      <Hero
        eyebrow="Dispatch"
        title={<>Delegate by difficulty,<br />not by model</>}
        lead="Dispatch routes a task to an installed coding-agent CLI by tier and remaining quota, runs it in its own git worktree, and returns a compact summary."
        actions={<LinkButton variant="ghost" href="/polterware">Meet Polterware<ArrowRight02Icon size={16} /></LinkButton>}
        aside={<span class="hero-status">{products.dispatch.status}</span>}
      />
      <Showcase><DispatchMockup /></Showcase>

      <Feature index="5.1" eyebrow="ROUTE" title="Pick a tier. Dispatch picks the agent."
        body="Choose easy, normal or hard. Dispatch selects an agent from the tier table and your quota headroom, and falls back if one fails."
        points={["Codex, Cursor, Grok and Antigravity", "Sensitive code moves up a tier automatically", "Local risk classification, no LLM call"]}
        visual={<DispatchMockup compact />} />
      <Feature index="5.2" eyebrow="INTEGRATE" title="Isolated runs you merge when they pass."
        body="Each run gets its own branch and worktree, with optional verification. You read a short summary, then merge or clean."
        points={["Background runs with wait and resume", "Verification gates the merge", "Merge conflicts detected before touching your tree"]}
        visual={<DispatchMockup compact />} reverse />

      <section class="next-row site-container">
        <NextLink href={products.polterware.href} detail="Main product" label="Polterware" />
        <NextLink href={products.notes.href} detail="Notes" label="Polterware Notes" />
      </section>
    </main>
  );
}
