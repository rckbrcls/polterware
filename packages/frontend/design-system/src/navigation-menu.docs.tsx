import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPreviewPanel,
  NavigationMenuTrigger,
} from "./navigation-menu";
import type { DocEntry } from "./docs/types";

export default {
  name: "Navigation menu",
  group: "Menus",
  summary:
    "Site navigation built on Ark NavigationMenu with a shared measured viewport and a fluid top-level pill. Use it for public site headers, not desktop product chrome.",
  exports: ["NavigationMenu", "NavigationMenuContent", "NavigationMenuIndicator", "NavigationMenuItem", "NavigationMenuLink", "NavigationMenuList", "NavigationMenuPreviewPanel", "NavigationMenuTrigger"],
  examples: [
    {
      id: "default",
      title: "Default",
      render: () => (
        // #region default
        <NavigationMenu aria-label="Main navigation">
          <NavigationMenuList>
            <NavigationMenuItem value="product">
              <NavigationMenuTrigger>Product</NavigationMenuTrigger>
              <NavigationMenuContent><NavigationMenuLink href="/overview">Overview</NavigationMenuLink></NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem><NavigationMenuLink href="/pricing">Pricing</NavigationMenuLink></NavigationMenuItem>
            <NavigationMenuIndicator />
          </NavigationMenuList>
        </NavigationMenu>
        // #endregion
      ),
    },
    {
      id: "preview-panel",
      title: "Preview panel",
      render: () => (
        // #region preview-panel
        <NavigationMenu aria-label="Product navigation">
          <NavigationMenuList>
            <NavigationMenuItem value="explore">
              <NavigationMenuTrigger>Explore</NavigationMenuTrigger>
              <NavigationMenuContent><NavigationMenuPreviewPanel items={[{ id: "context", title: "Context", description: "Shared project evidence.", href: "/context", preview: () => <span>Context preview</span> }]} /></NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
