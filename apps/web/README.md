# Polterware Web

The public product site at `polterware.com`, maintained as `@polterware/web` in this monorepo. Today it is a single landing page for Polterware Vitals (alpha); the earlier multi-product site lives on the `backup/web-full` branch.

## Development

Use Node.js 24 or newer and the workspace pnpm version. From the monorepo root:

```bash
pnpm install
pnpm dev:web
pnpm typecheck:web
pnpm build:web
pnpm preview:web
```

Development uses port 5178; preview uses port 4178. Builds emit static files in `apps/web/.output/public`.

## Structure

- `src/routes` — home (`/`, the Polterware Vitals landing) and the not-found page; `/vitals` redirects to `/`
- `src/data/products.ts` — repository and release links, the install command and the Vitals summary
- `src/components` — site header, footer, page sections, scroll parallax (`parallax.ts`, built on `motion`) and metadata
- `src/components/mockups` — the code-built Polterware Vitals illustration
- `public` — brand assets and the install script

SolidStart 2 uses Solid, Vite 8, TypeScript and Tailwind 4. The app imports `@polterware/frontend-design-system` directly and uses the monorepo's shared Tailwind tokens. Desktop tooling remains on its existing Vite version.

## Content and delivery

Copy describes shipped behavior only; product pictures are code-built illustrations, not screenshots. All routes are pre-rendered during the build. HTML includes page-specific descriptions, canonical links and sharing metadata, plus browser translation protection.

There is no contact form, database integration, authentication or runtime backend. Configure a static host to serve directory `index.html` files and return `404.html` with HTTP 404 for unknown paths. Do not rewrite every path to the home page. Publishing and domain changes are separate operations.

See [deployment](docs/deployment.md), [architecture](docs/architecture.md) and [getting started](docs/getting-started.md).
