import { LinkButton, ArrowRight02Icon } from "@polterware/frontend-design-system";
import { Seo } from "../components/Seo";
import { Feature, Hero, InstallCommand, NextLink, Showcase } from "../components/Sections";
import { VitalsMockup } from "../components/mockups/VitalsMockup";
import { RELEASES_URL, installCommand, products } from "../data/products";

export default function VitalsPage() {
  return (
    <main id="main" tabindex="-1">
      <Seo title="Polterware Vitals" description={products.vitals.summary} path="/vitals" />
      <Hero
        eyebrow="Polterware Vitals"
        title={<>Your machines,<br />at a glance</>}
        lead="A small local-first companion. Connect to a host over SSH and see CPU, memory, disks, network and processes, then open a terminal without leaving the app."
        actions={<>
          <LinkButton variant="primary" href="#install">Download for macOS</LinkButton>
          <LinkButton variant="ghost" href="/polterware">Meet Polterware<ArrowRight02Icon size={16} /></LinkButton>
        </>}
        aside={<span class="hero-status">{products.vitals.status}</span>}
      />
      <Showcase><VitalsMockup /></Showcase>

      <Feature index="3.1" eyebrow="CONNECT" title="SSH in, with host keys approved."
        body="Add a host with your existing SSH setup. Polterware Vitals asks you to approve the host key and manages a small metrics agent on the remote machine."
        points={["Host key approval on first connect", "A remote metrics agent managed by the app", "An integrated terminal for connected hosts"]}
        visual={<VitalsMockup compact />} />

      <section id="install" class="install-section site-container" aria-labelledby="install-title">
        <p class="eyebrow mono">INSTALL</p>
        <h2 id="install-title">Install Polterware Vitals</h2>
        <p>Alpha builds for macOS on Apple Silicon. Run the same command again to update.</p>
        <InstallCommand command={installCommand("vitals")} />
        <a class="text-link" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">All releases<ArrowRight02Icon size={14} /></a>
      </section>

      <section class="next-row site-container">
        <NextLink href={products.polterware.href} detail="Main product" label="Polterware" />
        <NextLink href={products.cli.href} detail="Terminal" label="Polterware CLI" />
      </section>
    </main>
  );
}
