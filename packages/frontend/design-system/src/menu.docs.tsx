import { MenuItem, MenuList, MenuPanel } from "./menu";
import type { DocEntry } from "./docs/types";

export default {
  name: "Menu rows",
  group: "Menus",
  summary:
    "Presentational menu panel and action rows for lists inside a Popover. They provide shared hover and selection motion without inventing a menu keyboard model.",
  exports: ["MenuList", "MenuItem", "MenuPanel"],
  examples: [
    {
      id: "default",
      title: "Default",
      render: () => (
        // #region default
        <MenuPanel><MenuList><MenuItem>Open project</MenuItem><MenuItem>View activity</MenuItem></MenuList></MenuPanel>
        // #endregion
      ),
    },
    {
      id: "states",
      title: "Selected, destructive, and disabled",
      render: () => (
        // #region states
        <MenuPanel><MenuList><MenuItem selected>Current project</MenuItem><MenuItem danger>Remove project</MenuItem><MenuItem disabled>Unavailable action</MenuItem></MenuList></MenuPanel>
        // #endregion
      ),
    },
    {
      id: "flat-panel",
      title: "Flat panel",
      render: () => (
        // #region flat-panel
        <MenuPanel elevated={false}><MenuList><MenuItem>Quiet menu row</MenuItem></MenuList></MenuPanel>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
