import type { Menu, MenuItemConstructorOptions } from "electron";

export type ApplicationMenuOptions = {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  checkForUpdates?: () => void;
};

export type ApplicationMenuApi = {
  buildFromTemplate: (template: MenuItemConstructorOptions[]) => Menu;
  setApplicationMenu: (menu: Menu | null) => void;
};

/** Build the Desktop application menu without browser-style zoom roles. */
export function buildApplicationMenuTemplate({
  isPackaged,
  platform,
  checkForUpdates,
}: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const viewSubmenu: MenuItemConstructorOptions[] = [];

  if (!isPackaged) {
    viewSubmenu.push({ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" });
  }

  viewSubmenu.push({ role: "togglefullscreen" });

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: viewSubmenu,
  };

  if (platform === "darwin") {
    return [checkForUpdates ? {
      role: "appMenu",
      submenu: [
        { role: "about" }, { type: "separator" },
        { label: "Check for Updates…", enabled: isPackaged, click: checkForUpdates },
        { type: "separator" }, { role: "services" }, { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" }, { role: "quit" },
      ],
    } : { role: "appMenu" }, { role: "editMenu" }, viewMenu, { role: "windowMenu" }];
  }

  return [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    { role: "editMenu" },
    viewMenu,
    { role: "windowMenu" },
  ];
}

/** Replace Electron's default browser-like menu with the Desktop menu. */
export function installApplicationMenu(
  options: ApplicationMenuOptions,
  menuApi: ApplicationMenuApi,
): void {
  menuApi.setApplicationMenu(menuApi.buildFromTemplate(buildApplicationMenuTemplate(options)));
}
