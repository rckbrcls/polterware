import { LinkButton, ArrowRight02Icon } from "@polterware/frontend-design-system";
import { Seo } from "../components/Seo";
import { Feature, Hero, InstallCommand, NextLink, Showcase } from "../components/Sections";
import { NotesMockup } from "../components/mockups/NotesMockup";
import { RELEASES_URL, installCommand, products } from "../data/products";

export default function NotesPage() {
  return (
    <main id="main" tabindex="-1">
      <Seo title="Polterware Notes" description={products.notes.summary} path="/notes" />
      <Hero
        eyebrow="Polterware Notes"
        title={<>Notes and reminders,<br />on your machine</>}
        lead="A local-first notes app with spaces, tags, search and reminders. Your coding agents can read and write the same notes through the CLI and MCP."
        actions={<>
          <LinkButton variant="primary" href="#install">Download for macOS</LinkButton>
          <LinkButton variant="ghost" href="/polterware">Meet Polterware<ArrowRight02Icon size={16} /></LinkButton>
        </>}
        aside={<span class="hero-status">{products.notes.status}</span>}
      />
      <Showcase><NotesMockup /></Showcase>

      <Feature index="4.1" eyebrow="CAPTURE" title="Write it down, find it later."
        body="Organize notes into spaces, tag them, and search across everything. Everything is stored locally in one database."
        points={["Spaces and tags", "Full-text search", "Reminders delivered by a native notifier"]}
        visual={<NotesMockup compact />} />

      <section id="install" class="install-section site-container" aria-labelledby="install-title">
        <p class="eyebrow mono">INSTALL</p>
        <h2 id="install-title">Install Polterware Notes</h2>
        <p>Alpha builds for macOS on Apple Silicon. Run the same command again to update.</p>
        <InstallCommand command={installCommand("notes")} />
        <a class="text-link" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">All releases<ArrowRight02Icon size={14} /></a>
      </section>

      <section class="next-row site-container">
        <NextLink href={products.polterware.href} detail="Main product" label="Polterware" />
        <NextLink href={products.dispatch.href} detail="Delegation" label="Dispatch" />
      </section>
    </main>
  );
}
