import { ArrowUpRight01Icon, LinkButton } from "@polterware/frontend-design-system";
import { RELEASES_URL, REPO_URL } from "../data/products";

export function SiteHeader() {
  return (
    <div class="site-header-bar">
      <header class="site-header site-container card-texture">
        <a class="wordmark" href="/" aria-label="Polterware home"><img src="/polter-ghost.png" alt="" width="30" height="36" /></a>
        <div class="site-header-actions">
          <LinkButton variant="texture" size="md" href={RELEASES_URL} target="_blank" rel="noopener noreferrer" class="hide-mobile">Releases<ArrowUpRight01Icon size={14} /></LinkButton>
          <LinkButton variant="texture" size="md" href={REPO_URL} target="_blank" rel="noopener noreferrer" class="hide-mobile">GitHub<ArrowUpRight01Icon size={14} /></LinkButton>
          <LinkButton variant="brand" keepVariant size="sm" href="/#install" class="site-header-download">Download</LinkButton>
        </div>
      </header>
    </div>
  );
}
