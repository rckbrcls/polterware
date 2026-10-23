# Polterware motion audit map

A starting map written on 2026-09-29 from a survey of the repo. It is a set of leads, not
current truth: re-run the greps before acting, and write each proposal from what a person
sees (surface, how often they look at it, what quality it buys), with the file and effort as
the footnote. A motion the product never had is a question for Erick; fixing one it already
does badly is a finding.

Contents: baseline (already good) · ranked opportunities · app-wide gaps · greps ·
proposal format · guardrails

## Baseline: what is already in place

- Tokens exist and are widely used: `--duration-fast|control|enter`, `--ease-standard|enter`
  (`packages/configuration/tailwind/base.css`). Off-token literals are rare (dialog enter
  220ms, drawer/detail-panel custom snap `cubic-bezier(0.16, 1.22, 0.3, 1)` 280ms,
  `atlas-tree.css` 100/180ms + 24ms stagger, loops in skeleton/core status/boot splash).
- Presence: Ark popups/dialog/drawer/toast animate with CSS keyframes/`@starting-style` on
  `data-state`; side-aware origin already exists for dropdown/popover
  (`dropdown-menu.css`, `popover.css`). Reduced-motion blocks exist in ~14 design-system CSS
  files and the toast/atlas tree.
- The Switch is the reference JS-spring component: `switch.tsx`, `springs.ts`.
- Only `switch.tsx` imports `motion`. Everything else is CSS transitions or WAAPI
  (`atlas-tree.ts` `animateGroupHeight`).

## Ranked opportunities (impact x frequency, then effort)

| # | Surface (what people see) | Now | Fluid upgrade | Files | Effort |
|---|---|---|---|---|---|
| 1 | **Section tabs** (every page header) | Each tab fills/unfills on its own (`.pw-tab--active` background swap, weight 550 via `font-weight`) | One active pill that glides on `spring.moderate`; hover pill born at the active one; ghost-span weight so labels do not shift | `design-system/src/tabs.tsx`, `tabs.css` | M |
| 2 | **Lists and tables** (Board, Specs, Sources, Facts, Inbox, Commander results) | Per-row CSS `:hover` backgrounds: blink off between rows | One shared `createFluidHover` + highlight behind the rows; gap click; rows lose their own hover fill | `table.tsx/css` (`.pw-data-table-row:hover`), `commander/palette-body.tsx`, `search-results.tsx`, `commander.css` (`.commander-action:hover`), `knowledge/work-board.css` | L (build the primitive once, then S per surface) |
| 3 | **Sidebar navigation** (always visible) | `.pw-sidebar-item:hover` and active fills swap instantly | One hover highlight over the item list and one active marker that glides between destinations; keep the count badges still | `features/shell/src/sidebar.tsx/css` | M |
| 4 | **Menus, popovers, tooltips** (Dropdown, filter popover, context menu, project/environment switchers) | Item highlight jumps; popups use CSS keyframes with 120-200ms | Fluid hover inside menus (from the checked row); sliding selected marker for checked items; enter on `fast`, exit quicker; keep side-aware origin | `dropdown-menu.tsx/css`, `menu.tsx`, `context-menu.tsx`, `filter-popover.tsx`, `shell/context-switchers.tsx`, `tooltip.tsx/css` | M |
| 5 | **Dialogs and drawers** (create project, evidence form, detail panel) | Keyframe scale/fade; detail panel snap has an overshoot curve | Align to `slow` enter / quicker exit; decide deliberately whether the detail panel's overshoot (`--detail-panel-snap-ease`) stays (it is intentional-looking: name it once) | `dialog.css`, `drawer.css`, `detail-panel.css` | S |
| 6 | **Buttons** (everywhere) | Colour transition only | 1px-inset press geometry (no scale), fast press / slow release; icon stroke 1.5 -> 2 on hover; loading keeps width | `button.tsx/css` | M (must stay on shared tokens; check `design:lint`) |
| 7 | **Collapses** (Atlas tree groups, detail-panel sections, filter groups) | WAAPI/CSS height + per-row stagger | Measured-height spring on `fast`, snap when a child resized; keep "bulk = no motion" rule | `architecture/src/atlas-tree.ts/css`, `detail-panel.tsx` | M |
| 8 | **Icon feedback** (copy, save, status) | Pop in/out | Two-glyph grid-cell crossfade, self-drawing check | Integrations connect actions, copy buttons in Settings/CLI reference | S each |
| 9 | **Filter chips / active filter bar** | Simple colour transitions | Chip enter/leave on `fast`, shared removal reflow | `filter-chip.tsx/css`, `active-filter-bar.tsx/css` | S |
| 10 | **Work board cards** | `.pw-work-card:hover` swap | Fluid hover (grid: axis `xy`, gap click capped ~16px), stage move glide | `knowledge/src/work-board.tsx/css` | M |

Skip or defer: skeleton/pulse and boot-splash loops (they already respect design rules;
only ensure reduced-motion), Terminal/Ops surfaces (removed), Corvu resizable dragging
(drag is glued 1:1 to the pointer by design; only collapse/expand flips could use `moderate`).

## App-wide gaps

1. **No shared reduced-motion helper for JS.** `switch.tsx` has a local
   `prefersReducedMotion`. Extract to the design system when the second consumer appears.
2. **No shared fluid-hover primitive.** ~20 `hover:bg` occurrences in TSX across
   `drawer.tsx`, `menu.tsx`, `dialog.tsx`, `button.tsx`, settings, commander, shell
   (`context-switchers.tsx`, `cli-reference-page.tsx`), architecture canvas pickers and
   cards, plus per-row `:hover` in CSS. Each is a candidate to route through one highlight
   *when it is a list of alternatives*; buttons stay `:hover`.
3. **Spring tokens are JS-only.** CSS uses `--duration-*`. Keep them aligned: fast 80ms is
   not a CSS token (120ms is). Decide with Erick whether to add `--duration-instant: 80ms`
   or leave CSS at 120/160/200 (recommendation: leave; springs feel faster than tweens at
   the same nominal time).
4. **Variable font**: weight-without-reflow needs a variable font with a `wght` axis.
   Verify the app's font before proposing the ghost-span pattern.
5. **`For` around animated rows** with rebuilt arrays (found and fixed in filter panel,
   agent setup hooks, view editor). Grep again for new ones.
6. **`opacity` linting**: `pnpm design:lint` (`tooling/check-ui-opacity.mjs`) rejects
   authored CSS `opacity` and alpha colours. Upstream fades use opacity; in JS springs this
   is applied through inline styles, which the linter does not scan, but confirm before
   relying on it, and prefer colour tokens for static dimming.

## Greps

```bash
# per-row hover fills that could become one highlight
rg -n "hover:bg|:hover" packages apps/polterware-desktop/src -g '*.tsx' -g '*.css' | rg -i "row|item|card|result|action"
# off-token timings
rg -nE "[0-9]+ms|cubic-bezier\(|transition: all" packages apps/polterware-desktop/src -g '*.css' | rg -v "var\(--(duration|ease)"
# layout-property transitions
rg -nE "transition[^;]*(width|height|top|left|margin|padding)" packages -g '*.css'
# animated rows inside For
rg -n "<For each" packages -g '*.tsx'
# keyframes without a reduced-motion guard
rg -l "@keyframes" packages apps/polterware-desktop/src -g '*.css' | xargs rg -L "prefers-reduced-motion"
```

## Proposal format (Audit mode)

For each of the 3-7 proposals: **Surface** and how often people see it; **What they feel
now**; **What changes** (mechanism + tier); **Files**; **Impact / Effort**; **Risk** (a11y,
`design:lint`, unrelated diffs, keyboard behavior). Order by impact per effort, systems
first (fluid hover primitive, reduced-motion helper) because they unlock many surfaces.
Ask Erick before changing anything the audit flags as "never had".

## Guardrails when implementing a proposal

- Reuse `springs.ts`; new shared primitives go in `packages/frontend/design-system/src/`
  and export from `index.ts`.
- Keep Ark for behavior/a11y; do not re-implement menus/tabs focus handling. Roving
  tabindex, typeahead, and `aria-*` stay theirs.
- Keyboard users get the same highlight movement (a keyboard move sets the active index;
  no separate focus ring inside menus).
- One change per surface, small diffs; the worktree has other agents' edits. Do not
  restyle unrelated CSS.
- No browser/tests/dev server unless Erick asks in that request; when he does, measure
  frames instead of eyeballing (see SKILL.md Verification).
