import { app, dialog } from "electron";
import { createDesktopUpdater } from "../../../../tooling/updater/runtime";

export const desktopUpdater = createDesktopUpdater({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  showError: (title, message) => dialog.showErrorBox(title, message),
});
