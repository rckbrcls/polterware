import type { ShortcutChord, ShortcutCommand, ShortcutCommandId, ShortcutOverrides } from "./types";

const MODIFIER_KEYS = new Set([
  "shift",
  "control",
  "ctrl",
  "alt",
  "option",
  "meta",
  "command",
  "cmd",
]);

/** Normalize a KeyboardEvent key/code into a stable chord key token. */
export function normalizeEventKey(key: string, code?: string): string {
  if (code === "Space" || key === " " || key === "Spacebar") return "space";
  if (key === "Dead") return "";

  const lower = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  switch (lower) {
    case "arrowup":
      return "arrowup";
    case "arrowdown":
      return "arrowdown";
    case "arrowleft":
      return "arrowleft";
    case "arrowright":
      return "arrowright";
    case "escape":
    case "esc":
      return "escape";
    case "enter":
    case "return":
      return "enter";
    case "backspace":
      return "backspace";
    case "delete":
    case "del":
      return "delete";
    case "tab":
      return "tab";
    case "plus":
      return "+";
    default:
      break;
  }

  if (key.length === 1) {
    // Shift+digit may surface as "!" / "@"; prefer the physical digit when available.
    if (code?.startsWith("Digit") && code.length === 6) {
      return code.slice(5)!;
    }
    if (code?.startsWith("Key") && code.length === 4) {
      return code.slice(3)!.toLowerCase();
    }
    return key.toLowerCase();
  }

  return lower;
}

export function chordFromEvent(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): ShortcutChord | null {
  if (MODIFIER_KEYS.has(event.key.toLowerCase())) return null;
  const key = normalizeEventKey(event.key, event.code);
  if (!key || key === "escape") return null;
  return {
    key,
    mod: event.metaKey || event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

export function chordsEqual(left: ShortcutChord, right: ShortcutChord): boolean {
  return (
    left.key === right.key
    && left.mod === right.mod
    && left.shift === right.shift
    && left.alt === right.alt
  );
}

export function serializeChord(chord: ShortcutChord): string {
  const parts: string[] = [];
  if (chord.mod) parts.push("mod");
  if (chord.alt) parts.push("alt");
  if (chord.shift) parts.push("shift");
  parts.push(chord.key);
  return parts.join("+");
}

export function parseChord(raw: string): ShortcutChord | null {
  const tokens = raw
    .trim()
    .toLowerCase()
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let mod = false;
  let shift = false;
  let alt = false;
  let key = "";

  for (const token of tokens) {
    if (
      token === "mod"
      || token === "cmd"
      || token === "command"
      || token === "meta"
      || token === "ctrl"
      || token === "control"
      || token === "commandorcontrol"
    ) {
      mod = true;
      continue;
    }
    if (token === "shift") {
      shift = true;
      continue;
    }
    if (token === "alt" || token === "option") {
      alt = true;
      continue;
    }
    if (key) return null;
    key = token === "return" ? "enter" : token === "del" ? "delete" : token === "esc" ? "escape" : token;
  }

  if (!key || MODIFIER_KEYS.has(key) || key === "escape") return null;

  const allowedSpecial = new Set([
    "space",
    "enter",
    "delete",
    "backspace",
    "tab",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "=",
    "+",
    "-",
  ]);
  if (key.length !== 1 && !allowedSpecial.has(key)) return null;

  return { key, mod, shift, alt };
}

export function isApplePlatform(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent);
}

const DISPLAY_SPECIAL: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  delete: "Delete",
  backspace: "Backspace",
  tab: "Tab",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  "=": "=",
  "+": "+",
  "-": "−",
};

function keyLabel(key: string): string {
  return DISPLAY_SPECIAL[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** A chord's display keys, modifiers first, one per key chip. */
export function chordKeys(chord: ShortcutChord, apple = isApplePlatform()): string[] {
  const parts: string[] = [];
  if (chord.mod) parts.push(apple ? "⌘" : "Ctrl");
  if (chord.alt) parts.push(apple ? "⌥" : "Alt");
  // "?" already names the shifted key.
  if (chord.shift && chord.key !== "?") parts.push(apple ? "⇧" : "Shift");
  parts.push(keyLabel(chord.key));
  return parts;
}

/** Human-readable chord for tooltips and Settings rows. */
export function formatChord(chord: ShortcutChord, apple = isApplePlatform()): string {
  return chordKeys(chord, apple).join(apple ? "" : "+");
}

/** "G then I" for tooltips and Commander hints. */
export function formatSequence(keys: readonly string[]): string {
  return keys.map(keyLabel).join(" then ");
}

/** Electron `globalShortcut` accelerator for a chord. */
export function chordToAccelerator(chord: ShortcutChord): string {
  const parts: string[] = [];
  if (chord.mod) parts.push("CommandOrControl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  const key =
    chord.key === "space"
      ? "Space"
      : chord.key === "enter"
        ? "Return"
        : chord.key === "delete"
          ? "Delete"
          : chord.key === "backspace"
            ? "Backspace"
            : chord.key === "+"
              ? "Plus"
              : chord.key.length === 1
                ? chord.key.toUpperCase()
                : chord.key.charAt(0).toUpperCase() + chord.key.slice(1);
  parts.push(key);
  return parts.join("+");
}

export function effectiveChords(
  command: ShortcutCommand,
  overrides: ShortcutOverrides,
): readonly ShortcutChord[] {
  const override = overrides[command.id];
  if (override) return [override];
  return command.defaultAliases
    ? [command.defaultChord, ...command.defaultAliases]
    : [command.defaultChord];
}

export function resolveChord(
  command: ShortcutCommand,
  overrides: ShortcutOverrides,
): ShortcutChord {
  return overrides[command.id] ?? command.defaultChord;
}

export function findConflict(
  commandId: ShortcutCommandId,
  chord: ShortcutChord,
  commands: readonly ShortcutCommand[],
  overrides: ShortcutOverrides,
): ShortcutCommand | null {
  const self = commands.find((command) => command.id === commandId);
  if (!self) return null;

  for (const command of commands) {
    if (command.id === commandId) continue;
    if (command.group !== self.group) continue;
    for (const candidate of effectiveChords(command, overrides)) {
      if (chordsEqual(candidate, chord)) return command;
    }
  }
  return null;
}

export function matchesChord(
  command: ShortcutCommand,
  overrides: ShortcutOverrides,
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  const chord = chordFromEvent(event);
  if (!chord) return false;
  return effectiveChords(command, overrides).some((candidate) => chordsEqual(candidate, chord));
}

/** How long the next key of a sequence may wait after the previous one. */
export const SEQUENCE_TIMEOUT_MS = 1200;

export type SequenceMatch<Id extends string> = { kind: "matched"; id: Id } | { kind: "pending" } | null;

function startsWith(keys: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= keys.length && prefix.every((key, index) => keys[index] === key);
}

/**
 * Matches key sequences such as G then I. Each key is pressed bare; a modifier, a key
 * no sequence continues with, or a pause past the timeout starts over.
 */
export function createSequenceMatcher<Id extends string>(
  sequences: readonly { id: Id; keys: readonly string[] }[],
  timeoutMs = SEQUENCE_TIMEOUT_MS,
  now: () => number = Date.now,
) {
  let pressed: string[] = [];
  let last = 0;

  const step = (prefix: string[]): SequenceMatch<Id> => {
    const exact = sequences.find((sequence) => sequence.keys.length === prefix.length && startsWith(sequence.keys, prefix));
    if (exact) {
      pressed = [];
      return { kind: "matched", id: exact.id };
    }
    if (sequences.some((sequence) => startsWith(sequence.keys, prefix))) {
      pressed = prefix;
      return { kind: "pending" };
    }
    pressed = [];
    return null;
  };

  return {
    press(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): SequenceMatch<Id> {
      // A lone modifier press neither continues nor breaks a sequence.
      if (MODIFIER_KEYS.has(event.key.toLowerCase())) return null;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        pressed = [];
        return null;
      }
      const key = normalizeEventKey(event.key, event.code);
      const at = now();
      if (at - last > timeoutMs) pressed = [];
      last = at;
      if (!key) {
        pressed = [];
        return null;
      }
      const prefix = [...pressed, key];
      // A key that breaks one sequence may start another.
      return step(prefix) ?? (prefix.length > 1 ? step([key]) : null);
    },
    reset() {
      pressed = [];
    },
  };
}

/** True when a key press lands in a field, menu, or dialog, where bare-key shortcuts stay quiet. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== "undefined"
    && target instanceof Element
    && Boolean(target.closest("input, textarea, select, [contenteditable=true], [contenteditable=''], [role=dialog], [role=menu], [role=listbox]"))
  );
}
