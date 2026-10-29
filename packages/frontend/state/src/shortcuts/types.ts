/** Stable chord tokens stored in preferences and compared for conflicts. */
export type ShortcutChord = {
  /** Normalized key: lowercase letter/digit, or special token (delete, enter, space, …). */
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
};

export type ShortcutGroup = "shell" | "structure";

export type ShortcutCommandId =
  | "shell.toggle_commander"
  | "shell.toggle_commander_global"
  | "shell.toggle_sidebar"
  | "shell.toggle_detail"
  | "shell.open_canvas"
  | "shell.open_filter"
  | "structure.add_node";

export type ShortcutCommand = {
  id: ShortcutCommandId;
  label: string;
  group: ShortcutGroup;
  defaultChord: ShortcutChord;
  /** Extra chords that match only while the command still uses its default binding. */
  defaultAliases?: readonly ShortcutChord[];
};

export type ShortcutOverrides = Partial<Record<ShortcutCommandId, ShortcutChord>>;

export type ShortcutPreferences = {
  version: 1;
  overrides: ShortcutOverrides;
};
