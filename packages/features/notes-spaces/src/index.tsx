import type { Component } from "solid-js";
import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import { SpacePage } from "./space-page";
import { SpacesSidebarTree } from "./spaces-tree";

type SpacesFeature = NotesFeature & {
  sidebarTree?: { id: string; component: Component };
};

const feature: SpacesFeature = {
  id: "spaces",
  routes: [
    { path: "/spaces", component: SpacePage, title: "Spaces" },
    { path: "/space/:id", component: SpacePage, title: "Space" },
  ],
  sidebar: [{ id: "spaces", label: "Spaces", path: "/spaces", icon: "brain" }],
  sidebarTree: { id: "spaces", component: SpacesSidebarTree },
};

export default feature;
export { SpacePage, SpacesSidebarTree };
