import type {
  BaseWindow,
  Menu,
  MenuItemConstructorOptions,
  WebContents,
  WebFrameMain,
} from "electron";

export type DesktopContextEditFlags = {
  canUndo?: boolean;
  canRedo?: boolean;
  canCut?: boolean;
  canCopy?: boolean;
  canPaste?: boolean;
  canSelectAll?: boolean;
};

export type DesktopContextMenuParams = {
  isEditable: boolean;
  selectionText: string;
  editFlags: DesktopContextEditFlags;
  frame?: WebFrameMain | null;
  x?: number;
  y?: number;
};

export type DesktopContextMenuApi = {
  buildFromTemplate: (template: MenuItemConstructorOptions[]) => Menu;
};

/** Pure template for Desktop right-click — edit/copy only, never Inspect/Reload. */
export function buildDesktopContextMenuTemplate(
  params: DesktopContextMenuParams,
): MenuItemConstructorOptions[] {
  if (params.isEditable) {
    const flags = params.editFlags;
    return [
      { role: "undo", enabled: flags.canUndo !== false },
      { role: "redo", enabled: flags.canRedo !== false },
      { type: "separator" },
      { role: "cut", enabled: Boolean(flags.canCut) },
      { role: "copy", enabled: Boolean(flags.canCopy) },
      { role: "paste", enabled: Boolean(flags.canPaste) },
      { role: "selectAll", enabled: Boolean(flags.canSelectAll) },
    ];
  }

  if (params.selectionText.trim().length > 0) {
    return [{ role: "copy", enabled: params.editFlags.canCopy !== false }];
  }

  return [];
}

/** Attach a minimal native context menu for editable fields and text selection. */
export function attachDesktopContextMenu(
  webContents: WebContents,
  menuApi: DesktopContextMenuApi,
  getOwnerWindow?: () => BaseWindow | undefined,
): void {
  webContents.on("context-menu", (_event, params) => {
    const template = buildDesktopContextMenuTemplate({
      isEditable: params.isEditable,
      selectionText: params.selectionText,
      editFlags: params.editFlags,
      frame: params.frame ?? undefined,
      x: params.x,
      y: params.y,
    });

    if (template.length === 0) {
      return;
    }

    menuApi.buildFromTemplate(template).popup({
      window: getOwnerWindow?.() ?? undefined,
      frame: params.frame ?? undefined,
      x: params.x,
      y: params.y,
    });
  });
}
