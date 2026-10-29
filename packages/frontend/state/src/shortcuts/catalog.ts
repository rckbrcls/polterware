import type { ShortcutChord, ShortcutCommand, ShortcutCommandId } from "./types";

function chord(partial: Partial<ShortcutChord> & Pick<ShortcutChord, "key">): ShortcutChord {
  return {
    key: partial.key,
    mod: partial.mod ?? false,
    shift: partial.shift ?? false,
    alt: partial.alt ?? false,
  };
}

/** Product shortcuts that already have real listeners. */
export const SHORTCUT_CATALOG: readonly ShortcutCommand[] = [
  {
    id: "shell.toggle_commander",
    label: "Toggle Commander",
    group: "shell",
    defaultChord: chord({ key: "k", mod: true }),
  },
  {
    id: "shell.toggle_commander_global",
    label: "Toggle Commander (global)",
    group: "shell",
    defaultChord: chord({ key: "k", mod: true, shift: true }),
  },
  {
    id: "shell.toggle_sidebar",
    label: "Toggle sidebar",
    group: "shell",
    defaultChord: chord({ key: "b", mod: true }),
  },
  {
    id: "shell.toggle_detail",
    label: "Close details",
    group: "shell",
    defaultChord: chord({ key: "j", mod: true }),
  },
  {
    id: "shell.open_canvas",
    label: "Open Canvas",
    group: "shell",
    defaultChord: chord({ key: "c", mod: true, shift: true }),
  },
  {
    id: "shell.open_filter",
    label: "Add filter",
    group: "shell",
    defaultChord: chord({ key: "f" }),
  },
  {
    id: "structure.add_node",
    label: "Add structure node",
    group: "structure",
    defaultChord: chord({ key: "n" }),
  },
] as const;

const BY_ID = new Map<ShortcutCommandId, ShortcutCommand>(
  SHORTCUT_CATALOG.map((command) => [command.id, command]),
);

export function getShortcutCommand(id: ShortcutCommandId): ShortcutCommand | undefined {
  return BY_ID.get(id);
}

export function shortcutsInGroup(group: ShortcutCommand["group"]): ShortcutCommand[] {
  return SHORTCUT_CATALOG.filter((command) => command.group === group);
}

export const SHORTCUT_GROUP_LABELS: Record<ShortcutCommand["group"], string> = {
  shell: "Shell",
  structure: "Structure",
};
