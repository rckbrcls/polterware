import { LIST_KEYS, SHORTCUT_CATALOG, SHORTCUT_GROUP_LABELS, SHORTCUT_SEQUENCES } from "./catalog";
import { chordKeys, isApplePlatform, resolveChord } from "./chord";
import type { ShortcutGroup, ShortcutOverrides, ShortcutReferenceGroup, ShortcutReferenceRow } from "./types";

/**
 * Every shortcut the app answers, grouped for the shortcuts panel: the rebindable chords
 * with the person's bindings, the G sequences, and the keys every list shares.
 */
export function shortcutReference(overrides: ShortcutOverrides, apple = isApplePlatform()): ShortcutReferenceGroup[] {
  const chords = (group: ShortcutGroup): ShortcutReferenceRow[] =>
    SHORTCUT_CATALOG.filter((command) => command.group === group).map((command) => ({
      id: command.id,
      label: command.label,
      keys: chordKeys(resolveChord(command, overrides), apple),
      join: "with",
    }));
  return [
    { label: "General", rows: chords("shell") },
    {
      label: "Navigation",
      rows: SHORTCUT_SEQUENCES.map((sequence) => ({
        id: sequence.id,
        label: sequence.label,
        keys: sequence.keys.map((key) => key.toUpperCase()),
        join: "then",
      })),
    },
    { label: "Lists", rows: LIST_KEYS },
    { label: SHORTCUT_GROUP_LABELS.work, rows: chords("work") },
    { label: SHORTCUT_GROUP_LABELS.structure, rows: chords("structure") },
  ];
}

/** Groups narrowed to rows whose label or keys contain the query. */
export function filterShortcutReference(groups: readonly ShortcutReferenceGroup[], query: string): ShortcutReferenceGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...groups];
  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) =>
        row.label.toLowerCase().includes(needle)
        || group.label.toLowerCase().includes(needle)
        || row.keys.join(" ").toLowerCase() === needle),
    }))
    .filter((group) => group.rows.length > 0);
}
