import { LinkButton } from "@polterware/frontend-design-system";
import { RELEASES_URL, REPO_URL } from "../data/products";

export function SiteHeader() {
  return (
    <div class="site-header-bar">
      <header class="site-header site-container card-texture">
        <a class="wordmark" href="/" aria-label="Polterware home"><img src="/polter-ghost.png" alt="" width="20" height="24" /></a>
        <div class="site-header-actions">
          <LinkButton variant="texture" size="sm" href={RELEASES_URL} target="_blank" rel="noopener noreferrer" class="hide-mobile">Releases</LinkButton>
          <LinkButton variant="texture" size="sm" href={REPO_URL} target="_blank" rel="noopener noreferrer" class="hide-mobile">GitHub</LinkButton>
          <LinkButton variant="texture" textureTone="brand" size="sm" href="/#install">Download</LinkButton>
        </div>
      </header>
    </div>
  );
}
