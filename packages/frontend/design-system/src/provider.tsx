import { createContext, useContext, type Accessor, type JSX } from "solid-js";
import { createShortcutLabel, detailPanelStore, matchesShortcut } from "@polterware/frontend-state";

export type DesignSystemShortcut = "shell.toggle_detail" | "shell.toggle_sidebar";
export type DesignSystemProviderProps = {
  storagePrefix: string;
  expandDetail?: () => void;
  matchesShortcut?: (id: DesignSystemShortcut, event: KeyboardEvent) => boolean;
  createShortcutLabel?: (id: DesignSystemShortcut) => Accessor<string>;
  children: JSX.Element;
};

const defaults = {
  storageKey: (_suffix: string): string | undefined => undefined,
  expandDetail: () => detailPanelStore.getState().expand(),
  matchesShortcut: (id: DesignSystemShortcut, event: KeyboardEvent) => matchesShortcut(id, event),
  createShortcutLabel: (id: DesignSystemShortcut) => createShortcutLabel(id),
};
const DesignSystemContext = createContext(defaults);

/** App adapters own detail state, shortcuts and storage. Explicit storage keys are never prefixed. */
export function DesignSystemProvider(props: DesignSystemProviderProps) {
  const value: typeof defaults = {
    storageKey: (suffix) => `${props.storagePrefix}.${suffix}`,
    expandDetail: () => (props.expandDetail ?? defaults.expandDetail)(),
    matchesShortcut: (id, event) => (props.matchesShortcut ?? defaults.matchesShortcut)(id, event),
    createShortcutLabel: (id) => (props.createShortcutLabel ?? defaults.createShortcutLabel)(id),
  };
  return <DesignSystemContext.Provider value={value}>{props.children}</DesignSystemContext.Provider>;
}

export function useDesignSystem() { return useContext(DesignSystemContext); }
