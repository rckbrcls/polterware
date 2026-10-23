import { For, createSignal } from "solid-js";
import {
  Button, Drawer, GitBranch, LinkButton, Menu01Icon, NavigationMenu,
  NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList,
  NavigationMenuTrigger, ScrollText, Download, navigationMenuTriggerClass,
} from "@polterware/frontend-design-system";
import { RELEASES_URL, REPO_URL } from "../data/products";

const resources = [
  { title: "Install", description: "One command for the macOS alpha builds", href: "/#install" },
  { title: "Source", description: "The monorepo on GitHub", href: REPO_URL, external: true },
  { title: "Releases", description: "Desktop builds and release notes", href: RELEASES_URL, external: true },
  { title: "Getting started", description: "README: build, run, set up agents", href: `${REPO_URL}#readme`, external: true },
];

export function SiteHeader() {
  const [open, setOpen] = createSignal(false);

  return (
    <div class="site-header-bar">
      <header class="site-header site-container card-texture">
        <a class="wordmark" href="/" aria-label="Polterware home"><img src="/polter-ghost.png" alt="" width="20" height="24" /></a>
        <NavigationMenu aria-label="Main" viewportAlign="center" class="site-nav">
          <NavigationMenuList>
            <NavigationMenuItem value="resources">
              <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
              <NavigationMenuContent>
                <div class="nav-resources">
                  <For each={resources}>{(item) => (
                    <NavigationMenuLink href={item.href} class="nav-resource" target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined}>
                      <strong>{item.title}</strong><span>{item.description}</span>
                    </NavigationMenuLink>
                  )}</For>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href={RELEASES_URL} class={navigationMenuTriggerClass} target="_blank" rel="noopener noreferrer">Changelog</NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <div class="site-header-actions">
          <LinkButton variant="texture" size="sm" href={REPO_URL} target="_blank" rel="noopener noreferrer" class="hide-mobile">GitHub</LinkButton>
          <LinkButton variant="texture" textureTone="brand" size="sm" href="/#install">Download</LinkButton>
          <Button variant="icon" class="show-mobile" aria-label="Open menu" onClick={() => setOpen(true)}><Menu01Icon size={18} /></Button>
        </div>
      </header>
      <Drawer open={open()} onClose={() => setOpen(false)} title="polterware" width={320}>
        <nav class="mobile-nav" aria-label="Mobile">
          <p class="eyebrow">Resources</p>
          <For each={resources}>{(item) => (
            <a href={item.href} onClick={() => setOpen(false)} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined}>
              {item.external ? <GitBranch size={16} /> : <Download size={16} />}<span><strong>{item.title}</strong></span>
            </a>
          )}</For>
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer"><ScrollText size={16} /><span><strong>Changelog</strong></span></a>
        </nav>
      </Drawer>
    </div>
  );
}
