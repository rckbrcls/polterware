export const APP_ICON_IDS = ["main", "black", "white"] as const;
export type AppIconId = (typeof APP_ICON_IDS)[number];
export const DEFAULT_APP_ICON_ID: AppIconId = "main";

export interface AppIconOption {
  id: AppIconId;
  label: string;
  previewDataUrl: string;
}

export interface AppIconSelection {
  defaultId: AppIconId;
  icon: AppIconOption;
  selectedId: AppIconId;
}
