export type ShellShortcut = "commander" | "quick-add" | "settings" | "back" | "forward" | "close-detail" | "route-1" | "route-2" | "route-3" | "route-4" | "route-5" | "route-6" | "search";
export function shellShortcut(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing">, editing: boolean): ShellShortcut | undefined {
  if (event.isComposing || event.altKey) return;
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey) {
    if (event.shiftKey) return;
    if (/^[1-6]$/.test(key)) return `route-${key}` as ShellShortcut;
    return ({ k: "commander", n: "quick-add", ",": "settings", "[": "back", "]": "forward", j: "close-detail" } as const)[key as "k"];
  }
  if (key === "/" && !editing) return "search";
}
export function isEditing(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
}

/** Collection actions belong to list focus or the document, never control chrome. */
export function isCollectionTarget(target: EventTarget | null): boolean {
  if (target === document || target === document.body) return true;
  if (!(target instanceof Element)) return false;
  if (target.closest('button, a[href], input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="menubar"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="listbox"], [role="option"]')) return false;
  return !!target.closest('[data-row-id], [role="row"], [role="grid"], [role="table"], [role="list"], table');
}

export type NoteShortcut = "open" | "toggle-done" | "edit-title" | "pin" | "delete";
export function noteShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing">, editing: boolean): NoteShortcut | undefined {
  if (editing || event.isComposing || event.altKey || event.shiftKey) return;
  if (event.metaKey || event.ctrlKey) return event.key === "Backspace" ? "delete" : undefined;
  return ({ Enter: "open", " ": "toggle-done", e: "edit-title", p: "pin" } as const)[event.key as "Enter"];
}
