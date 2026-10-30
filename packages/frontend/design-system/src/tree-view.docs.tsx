import { TreeView } from "./tree-view";
import { File, Folder } from "./hugeicons";
import type { DocEntry } from "./docs/types";

const nodes = [
  { id: "project", label: "Project", icon: <Folder size={14} />, children: [{ id: "readme", label: "README.md", icon: <File size={14} /> }, { id: "source", label: "src", icon: <Folder size={14} /> }] },
  { id: "archive", label: "Archive", icon: <Folder size={14} /> },
];

export default {
  name: "Tree View",
  group: "Layout",
  summary: "An Ark-backed hierarchical tree with optional expand indicators, guides, icons, trailing content, and fluid row hover. Provide stable node ids and an accessible label.",
  exports: ["TreeView"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <TreeView nodes={nodes} label="Project files" defaultExpandedValue={["project"]} />
      // #endregion
    ) },
    { id: "fluid-hover", title: "Fluid hover", render: () => (
      // #region fluid-hover
      <TreeView nodes={nodes} label="Project files" defaultExpandedValue={["project"]} fluidHover />
      // #endregion
    ) },
    { id: "branches", title: "Branches", render: () => (
      // #region branches
      <TreeView branches nodes={[
        { id: "project", label: "Project", icon: <Folder size={14} />, children: [
          { id: "app", label: "app", icon: <Folder size={14} />, children: [{ id: "main", label: "main.ts", icon: <File size={14} /> }, { id: "view", label: "view.tsx", icon: <File size={14} /> }] },
          { id: "readme", label: "README.md", icon: <File size={14} /> },
          { id: "src", label: "src", icon: <Folder size={14} />, children: [{ id: "index", label: "index.ts", icon: <File size={14} /> }] },
        ] },
        { id: "archive", label: "Archive", icon: <Folder size={14} /> },
      ]} label="Project files" defaultExpandedValue={["project", "app", "src"]} />
      // #endregion
    ) },
    { id: "compact-branches", title: "Compact branches", render: () => (
      // #region compact-branches
      <TreeView branches compact nodes={[
        { id: "project", label: "Project", icon: <Folder size={14} />, children: [
          { id: "app", label: "app", icon: <Folder size={14} />, children: [{ id: "main", label: "main.ts", icon: <File size={14} /> }] },
          { id: "readme", label: "README.md", icon: <File size={14} /> },
        ] },
      ]} label="Project files" defaultExpandedValue={["project", "app"]} />
      // #endregion
    ) },
    { id: "minimal", title: "Without guides", render: () => (
      // #region minimal
      <TreeView nodes={nodes} label="Project files" defaultExpandedValue={["project"]} indicator={false} guides={false} />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
