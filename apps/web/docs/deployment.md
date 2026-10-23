# Deployment

Run `pnpm build:web` from the monorepo root with Node.js 24 or newer. Deploy only `apps/web/.output/public` to a static host. No provider or domain is configured by this migration.

Serve nested `index.html` files for direct navigation to `/polterware`, `/polterware/cli` and `/vitals`. Return the generated `404.html` with HTTP 404 for unknown paths; do not use a home-page SPA rewrite.

`pnpm preview:web` serves the production output locally on port 4175. Check direct navigation, reloads, artwork, canonical URLs and sharing metadata before publication.

There are no required environment variables. Public metadata uses `https://polterware.com`. This app does not send contact messages or access Supabase.

The static output must include `install.sh`, copied by Vite from the `public/install.sh` symlink to `scripts/install-desktop.sh`. Serve it at `https://polterware.com/install.sh` as plain text, without a page rewrite. Commands select the app with `APP=polterware`, `APP=notes`, or `APP=vitals`.

Desktop updates use Sparkle with one signed feed per app in `updates/`. The release workflow attaches `appcast.xml` only after signing the ZIP; `.github/workflows/desktop-update-feeds.yml` advances the matching feed on `release.published`, including alphas, and rejects older build numbers. Both workflows and the initial empty feeds must be on `main` before publishing the first updater-enabled release. The repository needs the `POLTERWARE_SPARKLE_PRIVATE_KEY` Actions secret and permission for the feed workflow to push to `main`. Drafts never advance a feed.

Existing installations without Sparkle need one manual install of an updater-enabled release. The new apps check daily by default and expose **Check for Updates…** in their application menu. Downloads are authenticated with the public Ed25519 key embedded in each bundle. Website deployment and desktop release publication are separate steps; changing source does not make `polterware.com/install.sh` live.
