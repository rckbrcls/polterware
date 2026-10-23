# Architecture

SolidStart 2 provides file routes, server rendering at build time, and client hydration. Nitro's static preset outputs the public files. The prerender list in `vite.config.ts` names every route.

`src/data/products.ts` is the source of product names, summaries, status and install details. Product pictures are code-built mockups in `src/components/mockups`. Images remain local. Shared Solid components come from `@polterware/frontend-design-system`; tokens come from `packages/configuration/tailwind/base.css`. No desktop bridge or Electron APIs are used.

Routes: `/` (Polterware Vitals, the only released product; unreleased products are listed as in development) and a not-found fallback. The header uses the shared `NavigationMenu` for resources. The full multi-product site is kept on the `backup/web-full` branch. The site has no contact endpoint or server-side application data.
