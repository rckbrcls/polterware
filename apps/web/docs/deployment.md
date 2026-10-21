# Deployment

Run `pnpm build:web` from the monorepo root with Node.js 24 or newer. Deploy only `apps/web/.output/public` to a static host. No provider or domain is configured by this migration.

Serve nested `index.html` files for direct navigation to `/polterware`, `/polterware/cli` and `/vitals`. Return the generated `404.html` with HTTP 404 for unknown paths; do not use a home-page SPA rewrite.

`pnpm preview:web` serves the production output locally on port 4175. Check direct navigation, reloads, artwork, canonical URLs and sharing metadata before publication.

There are no required environment variables. Public metadata uses `https://polterware.com`. This app does not send contact messages or access Supabase.
