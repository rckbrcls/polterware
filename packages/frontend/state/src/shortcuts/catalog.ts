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
    id: "architecture.tool_select",
    label: "Select tool",
    group: "architecture",
    defaultChord: chord({ key: "v" }),
  },
  {
    id: "architecture.tool_hand",
    label: "Hand tool",
    group: "architecture",
    defaultChord: chord({ key: "h" }),
  },
  {
    id: "architecture.tool_connect",
    label: "Connect tool",
    group: "architecture",
    defaultChord: chord({ key: "c" }),
  },
  {
    id: "architecture.add_node",
    label: "Add to architecture",
    group: "architecture",
    defaultChord: chord({ key: "n" }),
  },
  {
    id: "architecture.temp_hand",
    label: "Temporary hand",
    group: "architecture",
    defaultChord: chord({ key: "space" }),
  },
  {
    id: "architecture.delete",
    label: "Delete selection",
    group: "architecture",
    defaultChord: chord({ key: "delete" }),
    defaultAliases: [chord({ key: "backspace" })],
  },
  {
    id: "architecture.open_node",
    label: "Open selected node",
    group: "architecture",
    defaultChord: chord({ key: "enter" }),
  },
  {
    id: "architecture.undo",
    label: "Undo canvas change",
    group: "architecture",
    defaultChord: chord({ key: "z", mod: true }),
  },
  {
    id: "architecture.redo",
    label: "Redo canvas change",
    group: "architecture",
    defaultChord: chord({ key: "z", mod: true, shift: true }),
  },
  {
    id: "architecture.select_all",
    label: "Select all",
    group: "architecture",
    defaultChord: chord({ key: "a", mod: true }),
  },
  {
    id: "architecture.copy",
    label: "Copy",
    group: "architecture",
    defaultChord: chord({ key: "c", mod: true }),
  },
  {
    id: "architecture.cut",
    label: "Cut",
    group: "architecture",
    defaultChord: chord({ key: "x", mod: true }),
  },
  {
    id: "architecture.paste",
    label: "Paste",
    group: "architecture",
    defaultChord: chord({ key: "v", mod: true }),
  },
  {
    id: "architecture.duplicate",
    label: "Duplicate",
    group: "architecture",
    defaultChord: chord({ key: "d", mod: true }),
  },
  {
    id: "architecture.save",
    label: "Save canvas layout",
    group: "architecture",
    defaultChord: chord({ key: "s", mod: true }),
  },
  {
    id: "architecture.zoom_reset",
    label: "Reset zoom",
    group: "architecture",
    defaultChord: chord({ key: "0" }),
  },
  {
    id: "architecture.zoom_in",
    label: "Zoom in",
    group: "architecture",
    defaultChord: chord({ key: "=" }),
    defaultAliases: [chord({ key: "+" })],
  },
  {
    id: "architecture.zoom_out",
    label: "Zoom out",
    group: "architecture",
    defaultChord: chord({ key: "-" }),
  },
  {
    id: "architecture.fit_document",
    label: "Fit architecture to view",
    group: "architecture",
    defaultChord: chord({ key: "1", shift: true }),
  },
  {
    id: "architecture.fit_selection",
    label: "Fit selection",
    group: "architecture",
    defaultChord: chord({ key: "2", shift: true }),
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
  architecture: "Architecture",
};
