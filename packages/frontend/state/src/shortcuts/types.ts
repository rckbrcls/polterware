/** Stable chord tokens stored in preferences and compared for conflicts. */
export type ShortcutChord = {
  /** Normalized key: lowercase letter/digit, or special token (delete, enter, space, …). */
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
};

export type ShortcutGroup = "shell" | "work" | "structure";

export type ShortcutCommandId =
  | "shell.toggle_commander"
  | "shell.toggle_commander_global"
  | "shell.toggle_sidebar"
  | "shell.toggle_detail"
  | "shell.show_shortcuts"
  | "shell.open_canvas"
  | "shell.open_filter"
  | "work.toggle_layout"
  | "structure.add_node";

export type ShortcutCommand = {
  id: ShortcutCommandId;
  label: string;
  group: ShortcutGroup;
  defaultChord: ShortcutChord;
  /** Extra chords that match only while the command still uses its default binding. */
  defaultAliases?: readonly ShortcutChord[];
};

/** Keys pressed one after another, such as G then I. Sequences are fixed; chords are rebindable. */
export type ShortcutSequenceId =
  | "go.inbox"
  | "go.activity"
  | "go.work"
  | "go.canvas"
  | "go.structure"
  | "go.truth"
  | "go.runs"
  | "go.projects";

export type ShortcutSequence = {
  id: ShortcutSequenceId;
  label: string;
  /** Normalized keys in order, each a bare letter. */
  keys: readonly string[];
};

/** One line of the shortcuts panel: display keys pressed together, in order, or as alternatives. */
export type ShortcutReferenceRow = {
  id: string;
  label: string;
  keys: readonly string[];
  join: "with" | "then" | "or";
};

export type ShortcutReferenceGroup = {
  label: string;
  rows: readonly ShortcutReferenceRow[];
};

export type ShortcutOverrides = Partial<Record<ShortcutCommandId, ShortcutChord>>;

export type ShortcutPreferences = {
  version: 1;
  overrides: ShortcutOverrides;
};
