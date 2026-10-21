import { For, createSignal } from "solid-js";
import { useLocation } from "@solidjs/router";
import {
  Activity, ArrowRight02Icon, BookOpen, Button, Drawer, GitBranch, LinkButton, Menu01Icon, NavigationMenu,
  NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuPreviewPanel,
  NavigationMenuTrigger, ScrollText, SquareTerminal, Download, navigationMenuTriggerClass,
  type NavigationMenuPreviewItem,
} from "@polterware/frontend-design-system";
import { RELEASES_URL, REPO_URL, products } from "../data/products";
import { PolterwareAppMockup } from "./mockups/PolterwareAppMockup";
import { CliTerminalMockup } from "./mockups/CliTerminalMockup";
import { VitalsMockup } from "./mockups/VitalsMockup";

const productItems: NavigationMenuPreviewItem[] = [
  { id: "polterware", title: "Polterware", description: "Project context and drift for people and coding agents.", href: products.polterware.href, icon: BookOpen, preview: () => <PolterwareAppMockup compact /> },
  { id: "cli", title: "Polterware CLI", description: "A TUI, scripted reads and writes, and an MCP bridge.", href: products.cli.href, icon: SquareTerminal, preview: () => <CliTerminalMockup compact session="agents" /> },
  { id: "vitals", title: "Polterware Vitals", description: "Remote machines over SSH: metrics, processes, terminal.", href: products.vitals.href, icon: Activity, preview: () => <VitalsMockup compact /> },
];

const resources = [
  { title: "Install", description: "One command for the macOS alpha builds", href: "/polterware#install" },
  { title: "Source", description: "The monorepo on GitHub", href: REPO_URL, external: true },
  { title: "Releases", description: "Desktop builds and release notes", href: RELEASES_URL, external: true },
  { title: "Getting started", description: "README: build, run, set up agents", href: `${REPO_URL}#readme`, external: true },
];

export function SiteHeader() {
  const location = useLocation();
  const [open, setOpen] = createSignal(false);
  const inProduct = (prefix: string) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);

  return (
    <div class="site-header-bar">
      <header class="site-header site-container card-texture">
        <a class="wordmark" href="/" aria-label="Polterware home"><img src="/polter-ghost.png" alt="" width="20" height="24" />polterware</a>
        <NavigationMenu aria-label="Main" viewportAlign="center" class="site-nav">
          <NavigationMenuList>
            <NavigationMenuItem value="products">
              <NavigationMenuTrigger>Products</NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavigationMenuPreviewPanel
                  items={productItems}
                  footer={<><span><strong>Alpha</strong> macOS on Apple Silicon</span>
                    <NavigationMenuLink href="/polterware#install" class="nav-footer-link">Install Polterware <ArrowRight02Icon size={14} /></NavigationMenuLink></>}
                />
              </NavigationMenuContent>
            </NavigationMenuItem>
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
              <NavigationMenuLink href={products.cli.href} class={navigationMenuTriggerClass} active={inProduct("/polterware/cli")}>CLI</NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href={RELEASES_URL} class={navigationMenuTriggerClass} target="_blank" rel="noopener noreferrer">Changelog</NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <div class="site-header-actions">
          <LinkButton variant="texture" size="sm" href={REPO_URL} target="_blank" rel="noopener noreferrer" class="hide-mobile">GitHub</LinkButton>
          <LinkButton variant="texture" textureTone="brand" size="sm" href="/polterware#install">Download</LinkButton>
          <Button variant="icon" class="show-mobile" aria-label="Open menu" onClick={() => setOpen(true)}><Menu01Icon size={18} /></Button>
        </div>
      </header>
      <Drawer open={open()} onClose={() => setOpen(false)} title="polterware" width={320}>
        <nav class="mobile-nav" aria-label="Mobile">
          <p class="eyebrow">Products</p>
          <For each={productItems}>{(item) => (
            <a href={item.href} onClick={() => setOpen(false)}>{item.icon && <item.icon size={16} />}<span><strong>{item.title}</strong><small>{item.description}</small></span></a>
          )}</For>
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
