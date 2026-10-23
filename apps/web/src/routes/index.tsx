import { LinkButton, ArrowUpRight01Icon } from "@polterware/frontend-design-system";
import { Seo } from "../components/Seo";
import { Feature, Hero, InstallCommand, Showcase } from "../components/Sections";
import { VitalsMockup } from "../components/mockups/VitalsMockup";
import { RELEASES_URL, installCommand, vitals } from "../data/products";

export default function Home() {
  return (
    <main id="main" tabindex="-1">
      <Seo title="polterware" description={vitals.summary} path="/" />
      <Hero
        title={<>Your machines,<br />at a glance</>}
        lead="A small local-first companion. Connect to a host over SSH and see CPU, memory, disks, network and processes, then open a terminal without leaving the app."
        actions={<>
          <LinkButton variant="primary" href="#install">Download for macOS</LinkButton>
          <LinkButton variant="ghost" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">Releases<ArrowUpRight01Icon size={16} /></LinkButton>
        </>}
      />
      <Showcase><VitalsMockup /></Showcase>

      <Feature index="1.0" eyebrow="CONNECT" title="SSH in, with host keys approved."
        body="Add a host with your existing SSH setup. Polterware Vitals asks you to approve the host key and manages a small metrics agent on the remote machine."
        points={["Host key approval on first connect", "A remote metrics agent managed by the app", "An integrated terminal for connected hosts"]}
        visual={<VitalsMockup compact />} />

      <section id="install" class="install-section site-container" aria-labelledby="install-title">
        <p class="eyebrow mono">INSTALL</p>
        <h2 id="install-title">Install Polterware Vitals</h2>
        <p>Alpha builds for macOS on Apple Silicon. Run the same command again to update.</p>
        <InstallCommand command={installCommand()} />
        <a class="text-link" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">All releases<ArrowUpRight01Icon size={14} /></a>
      </section>

    </main>
  );
}
