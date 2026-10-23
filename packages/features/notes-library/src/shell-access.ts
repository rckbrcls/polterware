import { useNotesShell, type NotesShellContext } from "@polterware/feature-notes-shell/feature";

/** Registry and tests call this during render. Missing host context is a fixture, not a crash. */
export function tryNotesShell(): NotesShellContext | undefined {
  try { return useNotesShell(); } catch { return undefined; }
}
