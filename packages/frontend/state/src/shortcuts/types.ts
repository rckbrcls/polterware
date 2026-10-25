/** Stable chord tokens stored in preferences and compared for conflicts. */
export type ShortcutChord = {
  /** Normalized key: lowercase letter/digit, or special token (delete, enter, space, …). */
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
};

export type ShortcutGroup = "shell" | "architecture";

export type ShortcutCommandId =
  | "shell.toggle_commander"
  | "shell.toggle_commander_global"
  | "shell.toggle_sidebar"
  | "shell.toggle_detail"
  | "shell.open_canvas"
  | "architecture.tool_select"
  | "architecture.tool_hand"
  | "architecture.tool_connect"
  | "architecture.add_node"
  | "architecture.temp_hand"
  | "architecture.delete"
  | "architecture.open_node"
  | "architecture.undo"
  | "architecture.redo"
  | "architecture.select_all"
  | "architecture.copy"
  | "architecture.cut"
  | "architecture.paste"
  | "architecture.duplicate"
  | "architecture.save"
  | "architecture.zoom_reset"
  | "architecture.zoom_in"
  | "architecture.zoom_out"
  | "architecture.fit_document"
  | "architecture.fit_selection";

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
