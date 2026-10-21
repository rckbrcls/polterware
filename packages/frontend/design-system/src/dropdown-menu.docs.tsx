import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import type { DocEntry } from "./docs/types";

export default {
  name: "Dropdown menu",
  group: "Menus",
  summary:
    "Compact Ark-powered dropdown with the shared Polter menu rows and keyboard behavior. Use it for concise action menus; searchable switchers belong in a Popover with MenuList.",
  exports: ["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuSeparator", "DropdownMenuTrigger"],
  examples: [
    {
      id: "default",
      title: "Default",
      render: () => (
        // #region default
        <DropdownMenu>
          <DropdownMenuTrigger><Button>Actions</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem value="rename">Rename</DropdownMenuItem>
            <DropdownMenuItem value="duplicate">Duplicate</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        // #endregion
      ),
    },
    {
      id: "selected-and-danger",
      title: "Selected and destructive items",
      render: () => (
        // #region selected-and-danger
        <DropdownMenu>
          <DropdownMenuTrigger><Button>Project options</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem value="personal" selected>Personal</DropdownMenuItem>
            <DropdownMenuItem value="team">Team</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem value="delete" danger>Delete project</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        // #endregion
      ),
    },
    {
      id: "disabled",
      title: "Disabled",
      render: () => (
        // #region disabled
        <DropdownMenu>
          <DropdownMenuTrigger disabled><Button disabled>Unavailable actions</Button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem value="publish">Publish</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
