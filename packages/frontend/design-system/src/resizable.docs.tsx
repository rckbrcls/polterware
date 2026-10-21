import { ResizableSidebar, ResizableSplit } from "../panels/resizable";
import type { DocEntry } from "./docs/types";

const SidebarContent = () => <nav class="p-3 text-sm text-[var(--color-text-secondary)]">Project navigation</nav>;
const MainContent = () => <main class="p-3 text-sm text-[var(--color-text-primary)]">Workspace content</main>;

export default {
  name: "Resizable Layout",
  group: "Layout",
  summary: "ResizableSidebar provides a collapsible edge sidebar with persisted sizing, and ResizableSplit divides two panels. Their handles support pointer and keyboard resizing.",
  exports: ["ResizableSidebar", "ResizableSplit"],
  examples: [
    { id: "sidebar", title: "Collapsible sidebar", wide: true, render: () => (
      // #region sidebar
      <div class="h-48 w-full"><ResizableSidebar sidebar={<SidebarContent />} ariaLabel="Project navigation"><MainContent /></ResizableSidebar></div>
      // #endregion
    ) },
    { id: "right-sidebar", title: "Right sidebar", wide: true, render: () => (
      // #region right-sidebar
      <div class="h-48 w-full"><ResizableSidebar side="right" defaultWidth={200} sidebar={<SidebarContent />} ariaLabel="Details"><MainContent /></ResizableSidebar></div>
      // #endregion
    ) },
    { id: "split", title: "Two-panel split", wide: true, render: () => (
      // #region split
      <div class="h-48 w-full"><ResizableSplit left={<SidebarContent />} right={<MainContent />} leftWidth={0.35} /></div>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
