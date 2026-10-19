# Polterware Desktop Design

This document defines the active visual and interaction contract for the first version.

## Product frame

Polterware is a dense local operator workspace, not a generic dashboard. Prefer calm hierarchy, compact controls, opaque surfaces, restrained borders, and minimal decorative effects. Use the shared design tokens and primitives in `@polterware/frontend-design-system`.

The application opens on Inbox. The project sidebar is fixed:

```text
Inbox
Work
Atlas
Decisions
Reality

FOOTER
  Settings
```

Settings is a dialog with a grouped rail: Project (General, Environments), Agents (Access, Sessions, Context), Integrations (Connected, Catalog), and App (Shortcuts, Advanced).

The title bar contains history controls, one ghost project switcher, one environment kind switcher, Commander, and a Help menu. There are no unrelated title-bar actions.

## Shared primitives

| Need | Required primitive |
| --- | --- |
| Text, password, search | `Input` and `.control-field` |
| Multiline input | `Textarea` |
| Selection | `Select` |
| Labeled control | `Field` |
| Stack of fields | `FormStack` |
| Icon + name record field | `IconNameField` |
| Actions | `Button` |
| Navigation actions | `LinkButton` (native anchor with shared button materials) |
| Nested section | `Card` |
| Elevated host | `Surface` |
| Dialog | `Dialog` or `A11yDialog` |
| Anchored surface | Ark-backed `Popover` |
| Compact menu | `MenuPanel` and `MenuItem` |
| Tabs | Ark-backed `Tabs` |
| Site navigation (public website) | Ark-backed `NavigationMenu` with `NavigationMenuPreviewPanel` |
| Section toolbar | compound `PageToolbar` |
| Filters | `FilterChip`, `FilterPopover`, or `ActiveFilterBar` |
| Operational collection | compound `DataTable` |
| Status | filled `StatusChip` |
| Entity details | global compound `DetailPanel` |
| Domain identity | `IconTile` |
| Loading placeholder | `Skeleton` / `PageSkeleton` (via `PageLoading`) |

Menu rows (dropdown and context menus) always lead with a 14px Hugeicons icon before the label; this is law. Every `ContextMenu.Item` and `MenuItem` carries an icon, and a menu never mixes rows with and without icons. Only checkable rows (switches, checkmarks) and pure value lists may omit it.

Text fields (`input`, `textarea`, `select`, contenteditable, and `control-field` inputs such as steppers and time fields) never show a focus ring, on click or keyboard, in any app; focus reads through the caret and selection. Do not add `outline`, `ring` or focus `box-shadow` to a text field. Buttons, links and composite widgets keep the neutral keyboard focus outline from `accessibility.css`.

Product features must not reproduce focus management, Escape behavior, outside dismissal, portals, positioning, or presence when the shared Ark-backed primitive owns it.

Dialogs in every Polterware app (Polterware, Polterware Notes, and Polterware Vitals) never draw dividers: spacing alone separates header, body, and footer. Footer actions are passed as a fragment of buttons, never wrapped: the dismiss action (Cancel, Reject, Skip) comes first and sits on the left; the primary or destructive action comes last on the right. A lone footer action stays on the right. The shared dialog owns its spacing: 28px side inset on every region, 24px above the 16px title and below the footer; features do not re-pad the body.


### Form spacing

The label sits tight to its control: `Field` owns a 6px label → control gap. Space between fields is 14px and comes from `FormStack`. Never use `space-y-*`, `grid gap-*` or a per-app override of `.pw-field` to space a form, and never pad a `Dialog` body again (the dialog already pads it). A record that has an icon and a color puts them in the `IconNameField` tile beside the name, not in separate rows.

## Collections and details

Operational collections use `DataTable`, sortable data columns, a narrow unsortable final actions column when row commands are needed, and one explicit Hugeicons domain icon in the primary cell. Long descriptions and secondary metadata belong in the detail panel.

`DataTable` columns are resizable in every app. Once the first rows paint, each column starts at its content width (capped at 320px) plus a proportional share of the spare viewport width; columns with an explicit `width` keep it and the last resizable column weighs double. The widths then freeze and the table switches to a fixed layout so live data never reflows columns. The last resizable column absorbs the remaining width. Each other resizable column header has a divider on its right edge: an 8px target around a 1px line. Widths stay between 48px and 360px; a column can override them with `minWidth`/`maxWidth`. Its pointer and keyboard contract is the DetailPanel divider's: arrows move 16px (64px with Shift), Home and End jump to the limits, double-click resets, and Escape cancels a drag. Only widths someone set persist, through `columnWidthsKey`. Cell text in resizable columns is clipped without an ellipsis. A shared `.pw-inline-fade` mask fades the right edge only when the text overflows, and one tooltip per table shows the full value. Actions, icon-only and selection columns pass `resizable={false}` and keep their width, and multi-line cells pass `wrap`.

Static reference tables (for example the CLI reference options, commands, and keys) also use `DataTable`, with `sortable={false}` columns, `resizableColumns={false}`, no row activation, no primary-cell icon, and wrapping description cells. The operational-collection rules above do not apply to them.

Entity detail uses the single lateral `DetailPanel` hosted by `MainSurface`, inside the central surface on its right side. `DetailPanel.CollectionHeader` mounts collection controls in a full-width upper band: `PageToolbar.Root` and `ActiveFilterBar` join it automatically inside the panel and render normally outside it. Toolbar padding is `8px 8px 4px`; wrapping controls and active filters determine the header's natural height. A separate workspace below contains the collection, sidebar and divider. Opening, closing, resizing or expanding details never changes the header width or disables its controls. The opaque, rounded panel reserves a column beside the collection; closing returns that width. The default lateral width is 400px, with a 320px minimum and 720px maximum, fitted to the available workspace. Its 8px divider supports direct pointer resize, cancellation, keyboard arrows (16px; Shift 64px), Home/End limits and double-click reset. A separate numeric sidebar-width key stores the preference; temporary host changes never rewrite it. Only old numeric widths migrate from the original key; floating geometry stays intact. Collection toolbars order search, filters and auxiliary actions before creation actions, with the primary creation action last; visual and keyboard focus order match.

Details start closed. Only explicit entity activation, including keyboard activation and entity navigation, opens them; changing collections closes them while preserving a valid selection. There is no toolbar opener or toggle slot. Cmd/Ctrl+J closes open details, and the expansion shortcut also requires an open panel. The detail header contains only close and expand/restore controls. Titles, metadata and entity actions remain in the scrollable content with 20px lateral padding. Expanded details occupy only the workspace below the collection header and restore to the saved lateral width. Escape cancels a resize, restores expansion, or returns focus to the selected item. Outside dismissal starts only on a completed click, including keyboard-generated clicks, preserving the clicked action and focus. Press-and-hold, movement of at least 3px, scrolling and cancelled gestures do not dismiss; tracking never takes pointer capture from the collection or Atlas. Closing disables panel input immediately and animates a 16px rightward translation and fade with the 160ms `spring.slow.exit`. The departing frame retains its lateral or expanded geometry; its lateral reservation releases together with hiding the frame at the end of the exit, never on pointer release. Reduced motion removes travel and keeps the 60ms `spring.fast.exit` fade. Reopening interrupts the exit from the current pose, and stale completion callbacks cannot hide reopened details. Panel content, registered owned portals including callback confirmations, and common `data-detail-opener` activators are exempt. Empty, loading and error states retain controls; unavailable collections hide them. Features do not create another entity inspector, detail route, drawer or modal.

`FloatingWindow` is a reusable design-system compound component, independent of entity selection and shell shortcuts: `Root` defines the boundary and controlled `open`, `minimized`, `expanded` state with `onOpenChange`, `onMinimizedChange`, and `onExpandedChange`; `Workspace` holds the background; `Content` mounts arbitrary window content; optional `Header` customizes chrome styling. Shared controls exist without content, with unique per-instance IDs. No product surface currently mounts a floating window. The existing geometry in `polterware.shell.detail.width` remains available for a future caller's optional `storageKey`. Without a key, geometry remains session-local.

The floating window preserves its opaque raised shell, shared radius, subtle rim and soft lift; default 520 × 420px at bottom right with a 16px margin, minimum 320 × 280px fitted to smaller hosts. Four corners and four edge midpoints are the eight docks; ties retain the current dock. Card and 48px minimized circle share the dock. Dragging follows freely and settles to the nearest possible component position with `spring.moderate`; four edges and four corners resize via 8px targets. Versioned geometry persists dock and dimensions, accepting old numeric widths and normalized anchors; host changes fit without rewriting preferences. Red closes, yellow minimizes, green expands/restores. The same yellow button becomes the draggable reopen circle, preserving focus. Closing uses the fast exit and leaves no circle; outside activation closes without consuming the action, excluding owned portals and `data-floating-window-opener` activators. Expansion disables gestures and restore recovers geometry. Arrow keys (16px; Shift 64px) move or resize, docking on release; Escape cancels gestures or restores expansion. Pointer capture, 3px dead zone, release-click suppression, rollback, reduced motion and cleanup remain shared behavior. `createDragMotion` and `motion` supply interruptible tracking and `spring.slow` morphs with unscaled content; the first paint does not animate.

Operational records use the record layout: `DetailPanel.Main` holds overview text, tables, and notes with 20px lateral padding; an optional `DetailPanel.Rail` holds `DetailPanel.Properties`, a label/value list where empty values are hidden (or offer an explicit add affordance). The rail stacks below the main column when the panel is narrower than 720px. Knowledge documents use document layout: title, inline properties and `DetailPanel.LinkedEntities` chips under it, then the shared Markdown editor. There is no shared span grid, and feature-owned rounded section cards are not structural detail chrome.

## Spacing and grouping

Separate sibling content groups with spacing, not divider lines. Do not add `border-t` / `border-b` rules or `<hr>` between entries in a list, section, or document; use a consistent gap scale instead (tighter inside a group, wider between groups). Borders stay on shared chrome — page headers, controls, surfaces, and tables — where they define an object, not a gap.

Reference and long-form reading pages (for example the CLI reference) use a single centered column (`mx-auto w-full max-w-3xl`) inside `PageContent`, with generous vertical padding. Long reference pages may add an "On this page" summary pinned to the left edge of `PageContent` (the reading column stays centered in the remaining space): sticky, hidden below `lg`, with the active item following the section in view. It uses the hover and selected surface tokens, not a rail line or divider.

## Surface and color rules

Structural fills are opaque shared neutral tokens. Text and labeled icons use opaque semantic colors, with icons inheriting `currentColor`. Do not add ad-hoc `rgba`, alpha hex, Tailwind opacity modifiers, `color-mix(... transparent)`, or translucent product chrome.

Covers and tiles reuse the shared chrome finish (a chromatic metal reflection derived from an accent color). Use `AuroraCover` and the `IconTile` aurora option where applicable; structural surfaces stay opaque neutral.

Exception — macOS Desktop window chrome only: the main window title bar and sidebar may use shared `--color-shell-glass` / `--color-sidebar-glass` washes so frosted Electron vibrancy shows through while keeping the quiet dark cast. Commander (in-app palette and global overlay) uses the same opaque `surface-panel-float` material as other product dialogs. All other product surfaces, text, dialogs, and cards stay opaque. Settings Advanced → Reduce transparency disables main-window vibrancy / frost and restores opaque title bar and sidebar. Do not extend this exception to Commander, other in-app dialogs, cards, or other platforms.

Polterware, Polterware Notes, and Polterware Vitals share one lifted dark neutral ladder from `base.css`: canvas, shell, and sidebar `#131313`, surfaces stepping from `#161616` to `#232323`. Apps do not override the dark ladder; only Polterware Vitals adds a light palette.

Use only these radius roles, from tightest to most generous:

- controls: `--radius-control` (10px)
- menu rows: `--radius-item` (10px)
- menus: `--radius-menu` (16px)
- nested cards: `--radius-card` (16px)
- host surfaces and large popovers: `--radius-surface` (22px)
- floating windows: `--radius-window` (24px)
- dialogs: `--radius-dialog` (30px), applied by the shared dialog to every app's dialogs
- pills, avatars, switches, and dots: `rounded-full`
- flat buttons (ghost and icon variants, dialog and drawer close buttons): `rounded-full`, so their hover fill is a pill or a circle; textured buttons keep `--radius-control`. A ghost button that sits in a list of rows (for example a sidebar entry) takes the row's `--radius-item`.

Nested radii stay concentric: an inner panel's radius is the outer radius minus the inset between them (for example `calc(var(--radius-dialog) - 0.5rem)` inside an `p-2` dialog).

Cards whose content can scroll put `.pw-scroll-fade` on the scroller (tables inside it fade too): a shared mask fades the top edge under the header and the bottom edge only while content continues past them. It is a mask on opaque content, not translucent chrome.

Use `control-field`, `.surface-panel`, `.surface-panel-float`, `.menu-panel`, and `Card` for shared edge-light chrome. Do not hand-roll border, background, and radius recipes.

## Execution honesty

Every screen must communicate whether an action is live, queued, completed, failed, unavailable, preview-only, or based on seeded demonstration data. Integration connect sessions report their actual core-owned state. A bounded inventory sync must not imply a complete provider graph, and no local action may imply a remote deployment or Cloud operation.

Motion may fade opacity only in transitions: presence keyframes in the shared popup, dialog, drawer, and toast CSS; boot splash and root cross-fade (`apps/polterware-desktop/src/renderer/boot-splash.css`, `apps/notes-desktop/src/renderer/boot-splash.css`); markdown editor dock visibility (`markdown-editor.css`); navigation menu viewport and content swaps (`navigation-menu.css`); template card enter keyframes (`template-card.css`); and Motion values in shared design-system motion primitives (the fluid hover highlight and gliding indicators). Resting surfaces stay opaque.

Run `pnpm design:lint` after UI changes. `tooling/check-ui-opacity.mjs` is the enforcement source; update this document before broadening its allowlist.

## Public website

`apps/web` is the product site for Polterware (the main product), the Polterware CLI and Polterware Vitals: a family home at `/` and one landing per product (`/polterware`, `/polterware/cli`, `/vitals`). It uses the same dark tokens, Inter, Hugeicons and shared primitives, with responsive layout, normal document scrolling and larger reading spacing than desktop product surfaces. The header uses the shared `NavigationMenu`; the Products menu is a `NavigationMenuPreviewPanel` with a live preview per product, and narrow screens use the shared `Drawer`. Product pictures are code-built mockups from tokens and shared primitives, labelled as illustrations, not screenshots or live data. Links use native anchors, including shared `LinkButton` for navigation actions; website routes do not use the desktop entity DetailPanel. Structural surfaces stay opaque, with no decorative grids or page-flip effects.
