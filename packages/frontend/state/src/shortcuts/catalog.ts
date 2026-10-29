import type { ShortcutChord, ShortcutCommand, ShortcutCommandId, ShortcutReferenceRow, ShortcutSequence } from "./types";

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
    defaultChord: chord({ key: "[" }),
  },
  {
    id: "shell.toggle_detail",
    label: "Close details",
    group: "shell",
    defaultChord: chord({ key: "j", mod: true }),
  },
  {
    id: "shell.show_shortcuts",
    label: "Keyboard shortcuts",
    group: "shell",
    defaultChord: chord({ key: "/", mod: true }),
    defaultAliases: [chord({ key: "?", shift: true })],
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
    id: "shell.create",
    label: "Create",
    group: "shell",
    defaultChord: chord({ key: "c" }),
  },
  {
    id: "work.toggle_layout",
    label: "Switch between list and board",
    group: "work",
    defaultChord: chord({ key: "b", mod: true }),
  },
  {
    id: "work.set_milestone",
    label: "Move to a milestone",
    group: "work",
    defaultChord: chord({ key: "m" }),
  },
  {
    id: "structure.add_node",
    label: "Add structure node",
    group: "structure",
    defaultChord: chord({ key: "n" }),
  },
] as const;

/** G then a letter jumps to a surface, as in Linear. */
export const SHORTCUT_SEQUENCES: readonly ShortcutSequence[] = [
  { id: "go.inbox", label: "Go to Inbox", keys: ["g", "i"] },
  { id: "go.activity", label: "Go to Activity", keys: ["g", "a"] },
  { id: "go.milestones", label: "Go to Milestones", keys: ["g", "m"] },
  { id: "go.canvas", label: "Go to Canvas", keys: ["g", "c"] },
  { id: "go.structure", label: "Go to Structure", keys: ["g", "s"] },
  { id: "go.truth", label: "Go to Truth", keys: ["g", "t"] },
  { id: "go.runs", label: "Go to Runs", keys: ["g", "r"] },
  { id: "go.projects", label: "Go to Projects", keys: ["g", "h"] },
];

/** Keys every list and entity page answers; listed in the shortcuts panel, not rebindable. */
export const LIST_KEYS: readonly ShortcutReferenceRow[] = [
  { id: "list.move", label: "Next or previous row", keys: ["J", "K"], join: "or" },
  { id: "list.select", label: "Select the row", keys: ["X"], join: "or" },
  { id: "list.peek", label: "Peek the row", keys: ["Space"], join: "or" },
  { id: "list.open", label: "Open the row", keys: ["Enter"], join: "or" },
  { id: "list.back", label: "Back to the row", keys: ["Esc"], join: "or" },
];

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
  work: "Milestones",
  structure: "Structure",
};

/** Rebindable groups in the order Settings and the shortcuts panel list them. */
export const SHORTCUT_GROUPS: readonly ShortcutCommand["group"][] = ["shell", "work", "structure"];
