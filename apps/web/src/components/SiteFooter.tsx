import { For, Show } from "solid-js";
import { ArrowUpRight01Icon } from "@polterware/frontend-design-system";
import { RELEASES_URL, REPO_URL } from "../data/products";

const columns = [
  {
    title: "Resources",
    links: [
      { label: "Install", href: "/#install" },
      { label: "Releases", href: RELEASES_URL, external: true },
      { label: "Getting started", href: `${REPO_URL}#readme`, external: true },
    ],
  },
  {
    title: "Polterware",
    links: [
      { label: "GitHub", href: REPO_URL, external: true },
      { label: "Security", href: `${REPO_URL}/security`, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer class="site-footer">
      <div class="site-container site-footer-grid">
        <div class="site-footer-brand">
          <a class="wordmark" href="/"><img src="/polter-ghost.png" alt="" width="20" height="24" />polterware</a>
          <p>Local-first tools for building software with agents.</p>
        </div>
        <For each={columns}>{(column) => (
          <nav aria-label={column.title}>
            <h2>{column.title}</h2>
            <ul>
              <For each={column.links}>{(link) => (
                <li><a href={link.href} target={"external" in link && link.external ? "_blank" : undefined} rel={"external" in link && link.external ? "noopener noreferrer" : undefined}>{link.label}<Show when={"external" in link && link.external}><ArrowUpRight01Icon size={12} aria-hidden="true" /></Show></a></li>
              )}</For>
            </ul>
          </nav>
        )}</For>
      </div>
    </footer>
  );
}
