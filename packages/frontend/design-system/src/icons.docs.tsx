import { For } from "solid-js";
import { Dynamic } from "solid-js/web";
import { PICKER_ICONS } from "./icon-picker";
import {
  Activity,
  Activity03Icon,
  AddTeam,
  Archive,
  ArrowDataTransferVertical,
  ArrowDown,
  ArrowRight02Icon,
  ArrowUp,
  ArrowUpRight01Icon,
  Bell,
  Blocks,
  Book03Icon,
  BookOpen,
  BookOpen02Icon,
  Bookshelf01Icon,
  Bot,
  Box,
  Boxes,
  Briefcase06Icon,
  Building2,
  CalendarClock,
  ChartRelationshipIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudCog,
  Cog,
  CollapseIcon,
  ConnectIcon,
  Copy,
  Cpu,
  CreditCard,
  Database,
  Delete,
  Download,
  DragDropVerticalIcon,
  ExpandIcon,
  ExternalLink,
  ExternalLinkIcon,
  Eye,
  File,
  FileDiff,
  FileText,
  FileUp,
  FingerAccessIcon,
  FloppyDisk,
  Folder,
  FolderKanban,
  Gauge,
  GitBranch,
  GitCompare,
  GitMerge,
  GitPullRequest,
  Globe,
  Globe2,
  Hammer,
  Hand,
  HardDrive,
  Heading02Icon,
  HelpCircle,
  History,
  Home01Icon,
  InformationCircle,
  House,
  HugeiconsIcon,
  Inbox,
  KeyRound,
  Laptop,
  Layers,
  LayoutDashboard,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  LibraryBig,
  Link,
  Link2,
  ListChecks,
  ListFilter,
  ListOrdered,
  MapPin,
  Maximize2,
  MemoryStick,
  Menu01Icon,
  MinusSignIcon,
  Monitor,
  Moon,
  MoreHorizontal,
  MousePointer2,
  Network,
  Package,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plug,
  Plus,
  PlusIcon,
  POLTER_ICON_STROKE_WIDTH,
  QuoteDownIcon,
  RadioButtonIcon,
  Redo2,
  RefreshCw,
  Route,
  Scale,
  SchemeIcon,
  ScrollText,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  SidebarRightIcon,
  Smartphone,
  SourceCodeIcon,
  Square,
  SquareChevronRight,
  SquareTerminal,
  StickyNote,
  Stop,
  Sun,
  Terminal,
  TextBoldIcon,
  TextItalicIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Undo2,
  User,
  Warehouse,
  Webhook,
  Workflow,
  Wrench01Icon,
  X,
  XIcon,
  Zap,
  AiBrain01Icon,
  AiSearchIcon,
  FirewallIcon,
  GridTableIcon,
  InfinityIcon,
  Key01Icon,
  McpServerIcon,
  RoboticIcon,
  SlidersHorizontalIcon,
  SquareLock02Icon,
} from "./hugeicons";
import type { DocEntry } from "./docs/types";

const icons = [
  ["Activity", Activity], ["Activity03Icon", Activity03Icon], ["AddTeam", AddTeam], ["Archive", Archive], ["ArrowDataTransferVertical", ArrowDataTransferVertical], ["ArrowDown", ArrowDown], ["ArrowRight02Icon", ArrowRight02Icon], ["ArrowUp", ArrowUp], ["ArrowUpRight01Icon", ArrowUpRight01Icon], ["Bell", Bell], ["Blocks", Blocks], ["Book03Icon", Book03Icon], ["BookOpen", BookOpen], ["BookOpen02Icon", BookOpen02Icon], ["Bookshelf01Icon", Bookshelf01Icon], ["Bot", Bot], ["Box", Box], ["Boxes", Boxes], ["Briefcase06Icon", Briefcase06Icon], ["Building2", Building2], ["CalendarClock", CalendarClock], ["ChartRelationshipIcon", ChartRelationshipIcon], ["Check", Check], ["ChevronDown", ChevronDown], ["ChevronLeft", ChevronLeft], ["ChevronRight", ChevronRight], ["Clock", Clock], ["Cloud", Cloud], ["CloudCog", CloudCog], ["Cog", Cog], ["CollapseIcon", CollapseIcon], ["ConnectIcon", ConnectIcon], ["Copy", Copy], ["Cpu", Cpu], ["CreditCard", CreditCard], ["Database", Database], ["Delete", Delete], ["Download", Download], ["DragDropVerticalIcon", DragDropVerticalIcon], ["ExpandIcon", ExpandIcon], ["ExternalLink", ExternalLink], ["ExternalLinkIcon", ExternalLinkIcon], ["Eye", Eye], ["File", File], ["FileDiff", FileDiff], ["FileText", FileText], ["FileUp", FileUp], ["FingerAccessIcon", FingerAccessIcon], ["FloppyDisk", FloppyDisk], ["Folder", Folder], ["FolderKanban", FolderKanban], ["Gauge", Gauge], ["GitBranch", GitBranch], ["GitCompare", GitCompare], ["GitMerge", GitMerge], ["GitPullRequest", GitPullRequest], ["Globe", Globe], ["Globe2", Globe2], ["Hammer", Hammer], ["Hand", Hand], ["HardDrive", HardDrive], ["Heading02Icon", Heading02Icon], ["HelpCircle", HelpCircle], ["History", History], ["Home01Icon", Home01Icon], ["InformationCircle", InformationCircle], ["House", House], ["Inbox", Inbox], ["KeyRound", KeyRound], ["Laptop", Laptop], ["Layers", Layers], ["LayoutDashboard", LayoutDashboard], ["LeftToRightListBulletIcon", LeftToRightListBulletIcon], ["LeftToRightListNumberIcon", LeftToRightListNumberIcon], ["LibraryBig", LibraryBig], ["Link", Link], ["Link2", Link2], ["ListChecks", ListChecks], ["ListFilter", ListFilter], ["ListOrdered", ListOrdered], ["MapPin", MapPin], ["Maximize2", Maximize2], ["MemoryStick", MemoryStick], ["Menu01Icon", Menu01Icon], ["MinusSignIcon", MinusSignIcon], ["Monitor", Monitor], ["Moon", Moon], ["MoreHorizontal", MoreHorizontal], ["MousePointer2", MousePointer2], ["Network", Network], ["Package", Package], ["Pause", Pause], ["Pencil", Pencil], ["Pin", Pin], ["PinOff", PinOff], ["Play", Play], ["Plug", Plug], ["Plus", Plus], ["PlusIcon", PlusIcon], ["QuoteDownIcon", QuoteDownIcon], ["RadioButtonIcon", RadioButtonIcon], ["Redo2", Redo2], ["RefreshCw", RefreshCw], ["Route", Route], ["Scale", Scale], ["SchemeIcon", SchemeIcon], ["ScrollText", ScrollText], ["Search", Search], ["Server", Server], ["Settings", Settings], ["Shield", Shield], ["ShieldCheck", ShieldCheck], ["SidebarRightIcon", SidebarRightIcon], ["Smartphone", Smartphone], ["SourceCodeIcon", SourceCodeIcon], ["Square", Square], ["SquareChevronRight", SquareChevronRight], ["SquareTerminal", SquareTerminal], ["StickyNote", StickyNote], ["Stop", Stop], ["Sun", Sun], ["Terminal", Terminal], ["TextBoldIcon", TextBoldIcon], ["TextItalicIcon", TextItalicIcon], ["ThumbsDownIcon", ThumbsDownIcon], ["ThumbsUpIcon", ThumbsUpIcon], ["Undo2", Undo2], ["User", User], ["Warehouse", Warehouse], ["Webhook", Webhook], ["Workflow", Workflow], ["Wrench01Icon", Wrench01Icon], ["X", X], ["XIcon", XIcon], ["Zap", Zap], ["AiBrain01Icon", AiBrain01Icon], ["AiSearchIcon", AiSearchIcon], ["FirewallIcon", FirewallIcon], ["GridTableIcon", GridTableIcon], ["InfinityIcon", InfinityIcon], ["Key01Icon", Key01Icon], ["McpServerIcon", McpServerIcon], ["RoboticIcon", RoboticIcon], ["SlidersHorizontalIcon", SlidersHorizontalIcon], ["SquareLock02Icon", SquareLock02Icon],
] as const;

export default {
  name: "Icons",
  group: "Icons",
  summary:
    "Polterware icons are Hugeicons Free Stroke Rounded components with a consistent default stroke width. Use the named icons for product UI and pass size or strokeWidth where the context needs a different scale.",
  exports: ["Activity", "Activity03Icon", "AddTeam", "Archive", "ArrowDataTransferVertical", "ArrowDown", "ArrowRight02Icon", "ArrowUp", "ArrowUpRight01Icon", "Bell", "Blocks", "Book03Icon", "BookOpen", "BookOpen02Icon", "Bookshelf01Icon", "Bot", "Box", "Boxes", "Briefcase06Icon", "Building2", "CalendarClock", "ChartRelationshipIcon", "Check", "ChevronDown", "ChevronLeft", "ChevronRight", "Clock", "Cloud", "CloudCog", "Cog", "CollapseIcon", "ConnectIcon", "Copy", "Cpu", "CreditCard", "Database", "Delete", "Download", "DragDropVerticalIcon", "ExpandIcon", "ExternalLink", "ExternalLinkIcon", "Eye", "File", "FileDiff", "FileText", "FileUp", "FingerAccessIcon", "FloppyDisk", "Folder", "FolderKanban", "Gauge", "GitBranch", "GitCompare", "GitMerge", "GitPullRequest", "Globe", "Globe2", "Hammer", "Hand", "HardDrive", "Heading02Icon", "HelpCircle", "History", "Home01Icon", "House", "HugeiconsIcon", "Inbox", "InformationCircle", "KeyRound", "Laptop", "Layers", "LayoutDashboard", "LeftToRightListBulletIcon", "LeftToRightListNumberIcon", "LibraryBig", "Link", "Link2", "ListChecks", "ListFilter", "ListOrdered", "MapPin", "Maximize2", "MemoryStick", "Menu01Icon", "MinusSignIcon", "Monitor", "Moon", "MoreHorizontal", "MousePointer2", "Network", "Package", "Pause", "Pencil", "Pin", "PinOff", "Play", "Plug", "Plus", "PlusIcon", "QuoteDownIcon", "RadioButtonIcon", "Redo2", "RefreshCw", "Route", "Scale", "SchemeIcon", "ScrollText", "Search", "Server", "Settings", "Shield", "ShieldCheck", "SidebarRightIcon", "Smartphone", "SourceCodeIcon", "Square", "SquareChevronRight", "SquareTerminal", "StickyNote", "Stop", "Sun", "Terminal", "TextBoldIcon", "TextItalicIcon", "ThumbsDownIcon", "ThumbsUpIcon", "Undo2", "User", "Warehouse", "Webhook", "Workflow", "Wrench01Icon", "X", "XIcon", "Zap", "AiBrain01Icon", "AiSearchIcon", "FirewallIcon", "GridTableIcon", "InfinityIcon", "Key01Icon", "McpServerIcon", "RoboticIcon", "SlidersHorizontalIcon", "SquareLock02Icon", "PICKER_ICONS", "POLTER_ICON_STROKE_WIDTH"],
  examples: [
    {
      id: "icon-grid",
      title: "Icon grid",
      wide: true,
      render: () => (
        // #region icon-grid
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <For each={icons}>
            {([name, Icon]) => (
              <div class="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
                <Dynamic component={Icon} size={16} />
                <span>{name}</span>
              </div>
            )}
          </For>
        </div>
        // #endregion
      ),
    },
    {
      id: "sizes-and-strokes",
      title: "Sizes and stroke width",
      render: () => (
        // #region sizes-and-strokes
        <>
          <Activity size={14} />
          <Activity size={20} />
          <Activity size={28} />
          <Activity size={20} strokeWidth={1} />
          <Activity size={20} strokeWidth={POLTER_ICON_STROKE_WIDTH} />
          <Activity size={20} strokeWidth={2} />
        </>
        // #endregion
      ),
    },
    {
      id: "picker-icons",
      title: "Picker icon set",
      render: () => (
        // #region picker-icons
        <div class="flex flex-wrap gap-3">
          <For each={Object.entries(PICKER_ICONS)}>
            {([name, Icon]) => (
              <span class="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)]">
                <Dynamic component={Icon} size={16} />
                {name}
              </span>
            )}
          </For>
        </div>
        // #endregion
      ),
    },
    {
      id: "custom-definition",
      title: "Custom definition",
      render: () => (
        // #region custom-definition
        <HugeiconsIcon icon={[["path", { d: "M4 12h16" }]]} size={20} strokeWidth={2} />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
