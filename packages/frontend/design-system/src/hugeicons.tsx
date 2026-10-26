import { For, splitProps, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  Activity as ActivityDefinition,
  Activity03Icon as Activity03IconDefinition,
  AddTeamIcon as AddTeamDefinition,
  Archive as ArchiveDefinition,
  ArrowDataTransferVerticalIcon as ArrowDataTransferVerticalDefinition,
  BellIcon as BellDefinition,
  BlocksIcon as BlocksDefinition,
  Book03Icon as Book03IconDefinition,
  BookOpen as BookOpenDefinition,
  BookOpen02Icon as BookOpen02IconDefinition,
  Bookshelf01Icon as Bookshelf01IconDefinition,
  Bot as BotDefinition,
  BoxIcon as BoxDefinition,
  BoxesIcon as BoxesDefinition,
  Briefcase06Icon as Briefcase06IconDefinition,
  Building2 as Building2Definition,
  CalendarClockIcon as CalendarClockDefinition,
  ChartRelationshipIcon as ChartRelationshipIconDefinition,
  CheckIcon as CheckDefinition,
  Clock as ClockDefinition,
  Cloud as CloudDefinition,
  CloudCogIcon as CloudCogDefinition,
  Cog as CogDefinition,
  ArrowShrink01Icon as CollapseIconDefinition,
  ConnectIcon as ConnectIconDefinition,
  Copy02Icon as CopyDefinition,
  Cpu as CpuDefinition,
  CreditCard as CreditCardDefinition,
  Database as DatabaseDefinition,
  Delete02Icon as DeleteDefinition,
  Download as DownloadDefinition,
  ExternalLinkIcon as ExternalLinkDefinition,
  Eye as EyeDefinition,
  ArrowExpand01Icon as ExpandIconDefinition,
  File as FileDefinition,
  FileDiffIcon as FileDiffDefinition,
  FileTextIcon as FileTextDefinition,
  FileUp as FileUpDefinition,
  FloppyDiskIcon as FloppyDiskDefinition,
  FingerAccessIcon as FingerAccessIconDefinition,
  Folder as FolderDefinition,
  FolderKanbanIcon as FolderKanbanDefinition,
  GaugeIcon as GaugeDefinition,
  GitBranch as GitBranchDefinition,
  GitCompare as GitCompareDefinition,
  GitMerge as GitMergeDefinition,
  GitPullRequest as GitPullRequestDefinition,
  Globe as GlobeDefinition,
  Globe02Icon as Globe2Definition,
  HammerIcon as HammerDefinition,
  HandIcon as HandDefinition,
  HardDrive as HardDriveDefinition,
  HelpCircleIcon as HelpCircleDefinition,
  InformationCircleIcon as InformationCircleDefinition,
  HistoryIcon as HistoryDefinition,
  HouseIcon as HouseDefinition,
  Inbox as InboxDefinition,
  KeyRoundIcon as KeyRoundDefinition,
  Laptop as LaptopDefinition,
  Layers as LayersDefinition,
  LayoutDashboardIcon as LayoutDashboardDefinition,
  LibraryBigIcon as LibraryBigDefinition,
  LinkIcon as LinkDefinition,
  Link2 as Link2Definition,
  ListChecksIcon as ListChecksDefinition,
  ListFilterIcon as ListFilterDefinition,
  ListOrderedIcon as ListOrderedDefinition,
  MapPin as MapPinDefinition,
  Maximize2 as Maximize2Definition,
  MemoryStick as MemoryStickDefinition,
  MonitorIcon as MonitorDefinition,
  MousePointer2 as MousePointer2Definition,
  NetworkIcon as NetworkDefinition,
  Package as PackageDefinition,
  PauseIcon as PauseDefinition,
  Pencil as PencilDefinition,
  PinIcon as PinDefinition,
  PinOffIcon as PinOffDefinition,
  Play as PlayDefinition,
  PlugIcon as PlugDefinition,
  PlusIcon as PlusDefinition,
  RadioButtonIcon as RadioButtonIconDefinition,
  Redo2 as Redo2Definition,
  RefreshCwIcon as RefreshCwDefinition,
  Route as RouteDefinition,
  ScaleIcon as ScaleDefinition,
  SchemeIcon as SchemeIconDefinition,
  ScrollTextIcon as ScrollTextDefinition,
  Search as SearchDefinition,
  ServerIcon as ServerDefinition,
  Settings as SettingsDefinition,
  Shield as ShieldDefinition,
  ShieldCheckIcon as ShieldCheckDefinition,
  SmartphoneIcon as SmartphoneDefinition,
  Square as SquareDefinition,
  SquareArrowRight02Icon as SquareChevronRightDefinition,
  ComputerTerminal01Icon as SquareTerminalDefinition,
  StickyNote as StickyNoteDefinition,
  Sun as SunDefinition,
  Moon as MoonDefinition,
  StopIcon as StopDefinition,
  Tag01Icon as TagDefinition,
  Terminal as TerminalDefinition,
  ThumbsDownIcon as ThumbsDownIconDefinition,
  ThumbsUpIcon as ThumbsUpIconDefinition,
  Undo2 as Undo2Definition,
  User as UserDefinition,
  Warehouse as WarehouseDefinition,
  Webhook as WebhookDefinition,
  WorkflowIcon as WorkflowDefinition,
  Wrench01Icon as Wrench01IconDefinition,
  XIcon as XDefinition,
  Zap as ZapDefinition,
  MoreHorizontalIcon as MoreHorizontalDefinition,
  TextBoldIcon as TextBoldIconDefinition,
  TextItalicIcon as TextItalicIconDefinition,
  Heading02Icon as Heading02IconDefinition,
  LeftToRightListBulletIcon as LeftToRightListBulletIconDefinition,
  LeftToRightListNumberIcon as LeftToRightListNumberIconDefinition,
  SourceCodeIcon as SourceCodeIconDefinition,
  QuoteDownIcon as QuoteDownIconDefinition,
  MinusSignIcon as MinusSignIconDefinition,
  SidebarRightIcon as SidebarRightIconDefinition,
  DragDropVerticalIcon as DragDropVerticalIconDefinition,
  Menu01Icon as Menu01IconDefinition,
  ArrowRight02Icon as ArrowRight02IconDefinition,
  ArrowUpRight01Icon as ArrowUpRight01IconDefinition,
} from "@hugeicons/core-free-icons";

type HugeIconNodeAttributes = Readonly<Record<string, string | number>>;

export type HugeIconDefinition = readonly (
  readonly [tag: string, attributes: HugeIconNodeAttributes]
)[];

export const POLTER_ICON_STROKE_WIDTH = 1.5;

export interface HugeiconsIconProps
  extends Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "children"> {
  icon: HugeIconDefinition;
  size?: string | number;
  strokeWidth?: number;
}

export type HugeiconComponent = Component<
  Omit<HugeiconsIconProps, "icon">
>;

interface DecorativeSvgAttributes extends JSX.SvgSVGAttributes<SVGSVGElement> {
  focusable: "false";
}

const DECORATIVE_SVG_ATTRIBUTES: DecorativeSvgAttributes = {
  focusable: "false",
};

interface NormalizedNodeAttributes {
  [key: string]: string | number;
  "stroke-width": number;
}

function normalizeNodeAttributes(
  attributes: HugeIconNodeAttributes,
  strokeWidth: number,
): NormalizedNodeAttributes {
  const {
    key: _key,
    strokeLinecap,
    strokeLinejoin,
    strokeWidth: _definitionStrokeWidth,
    ...rest
  } = attributes;

  const result: NormalizedNodeAttributes = {
    ...rest,
    "stroke-width": strokeWidth,
  };
  if (strokeLinecap !== undefined) result["stroke-linecap"] = strokeLinecap;
  if (strokeLinejoin !== undefined) result["stroke-linejoin"] = strokeLinejoin;
  return result;
}

export function HugeiconsIcon(props: HugeiconsIconProps): JSX.Element {
  const [local, svgProps] = splitProps(props, [
    "icon",
    "size",
    "strokeWidth",
    "class",
    "color",
    "aria-hidden",
  ]);
  const size = () => local.size ?? 24;
  const strokeWidth = () =>
    local.strokeWidth ?? POLTER_ICON_STROKE_WIDTH;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      color={local.color ?? "currentColor"}
      class={local.class}
      aria-hidden={local["aria-hidden"] ?? "true"}
      {...svgProps}
      {...DECORATIVE_SVG_ATTRIBUTES}
    >
      <For each={local.icon}>
        {([tag, attributes]) => (
          <Dynamic
            component={tag}
            {...normalizeNodeAttributes(attributes, strokeWidth())}
          />
        )}
      </For>
    </svg>
  );
}

function createHugeicon(
  definition: HugeIconDefinition,
): HugeiconComponent {
  return (props) => <HugeiconsIcon {...props} icon={definition} />;
}

/** Straight, symmetric chevron: the library's own chevrons round their apex into a curve that looks off at 14px. */
function chevron(d: string): HugeIconDefinition {
  return [["path", { d, stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", key: "0" }]];
}
const ChevronDownShape = chevron("M6 9L12 15L18 9");
const ChevronUpShape = chevron("M6 15L12 9L18 15");
const ChevronLeftShape = chevron("M15 6L9 12L15 18");
const ChevronRightShape = chevron("M9 6L15 12L9 18");

const iconDefinitions = {
  Activity: ActivityDefinition,
  Activity03Icon: Activity03IconDefinition,
  AddTeam: AddTeamDefinition,
  Archive: ArchiveDefinition,
  ArrowDataTransferVertical: ArrowDataTransferVerticalDefinition,
  ArrowDown: ChevronDownShape,
  ArrowUp: ChevronUpShape,
  Bell: BellDefinition,
  Blocks: BlocksDefinition,
  Book03Icon: Book03IconDefinition,
  BookOpen: BookOpenDefinition,
  BookOpen02Icon: BookOpen02IconDefinition,
  Bookshelf01Icon: Bookshelf01IconDefinition,
  Bot: BotDefinition,
  Box: BoxDefinition,
  Boxes: BoxesDefinition,
  Briefcase06Icon: Briefcase06IconDefinition,
  Building2: Building2Definition,
  CalendarClock: CalendarClockDefinition,
  ChartRelationshipIcon: ChartRelationshipIconDefinition,
  XIcon: XDefinition,
  Check: CheckDefinition,
  ChevronDown: ChevronDownShape,
  ChevronLeft: ChevronLeftShape,
  ChevronRight: ChevronRightShape,
  Clock: ClockDefinition,
  Cloud: CloudDefinition,
  CloudCog: CloudCogDefinition,
  Cog: CogDefinition,
  CollapseIcon: CollapseIconDefinition,
  ConnectIcon: ConnectIconDefinition,
  Copy: CopyDefinition,
  Cpu: CpuDefinition,
  CreditCard: CreditCardDefinition,
  Database: DatabaseDefinition,
  Delete: DeleteDefinition,
  Download: DownloadDefinition,
  ExternalLink: ExternalLinkDefinition,
  Eye: EyeDefinition,
  ExpandIcon: ExpandIconDefinition,
  File: FileDefinition,
  FileDiff: FileDiffDefinition,
  FileText: FileTextDefinition,
  FileUp: FileUpDefinition,
  FloppyDisk: FloppyDiskDefinition,
  FingerAccessIcon: FingerAccessIconDefinition,
  Folder: FolderDefinition,
  FolderKanban: FolderKanbanDefinition,
  Gauge: GaugeDefinition,
  GitBranch: GitBranchDefinition,
  GitCompare: GitCompareDefinition,
  GitMerge: GitMergeDefinition,
  GitPullRequest: GitPullRequestDefinition,
  Globe: GlobeDefinition,
  Globe2: Globe2Definition,
  Hammer: HammerDefinition,
  Hand: HandDefinition,
  HardDrive: HardDriveDefinition,
  HelpCircle: HelpCircleDefinition,
  InformationCircle: InformationCircleDefinition,
  History: HistoryDefinition,
  House: HouseDefinition,
  Inbox: InboxDefinition,
  KeyRound: KeyRoundDefinition,
  Laptop: LaptopDefinition,
  Layers: LayersDefinition,
  LayoutDashboard: LayoutDashboardDefinition,
  LibraryBig: LibraryBigDefinition,
  Link: LinkDefinition,
  Link2: Link2Definition,
  ListChecks: ListChecksDefinition,
  ListFilter: ListFilterDefinition,
  ListOrdered: ListOrderedDefinition,
  MapPin: MapPinDefinition,
  Maximize2: Maximize2Definition,
  MemoryStick: MemoryStickDefinition,
  Monitor: MonitorDefinition,
  MousePointer2: MousePointer2Definition,
  Network: NetworkDefinition,
  Package: PackageDefinition,
  Pause: PauseDefinition,
  Pencil: PencilDefinition,
  Pin: PinDefinition,
  PinOff: PinOffDefinition,
  Play: PlayDefinition,
  Plug: PlugDefinition,
  Plus: PlusDefinition,
  RadioButtonIcon: RadioButtonIconDefinition,
  Redo2: Redo2Definition,
  RefreshCw: RefreshCwDefinition,
  Route: RouteDefinition,
  Scale: ScaleDefinition,
  SchemeIcon: SchemeIconDefinition,
  ScrollText: ScrollTextDefinition,
  Search: SearchDefinition,
  Server: ServerDefinition,
  Settings: SettingsDefinition,
  Shield: ShieldDefinition,
  ShieldCheck: ShieldCheckDefinition,
  Smartphone: SmartphoneDefinition,
  Square: SquareDefinition,
  SquareChevronRight: SquareChevronRightDefinition,
  SquareTerminal: SquareTerminalDefinition,
  StickyNote: StickyNoteDefinition,
  Sun: SunDefinition,
  Moon: MoonDefinition,
  Stop: StopDefinition,
  Tag: TagDefinition,
  Terminal: TerminalDefinition,
  ThumbsDownIcon: ThumbsDownIconDefinition,
  ThumbsUpIcon: ThumbsUpIconDefinition,
  Undo2: Undo2Definition,
  User: UserDefinition,
  Warehouse: WarehouseDefinition,
  Webhook: WebhookDefinition,
  Workflow: WorkflowDefinition,
  Wrench01Icon: Wrench01IconDefinition,
  X: XDefinition,
  Zap: ZapDefinition,
  MoreHorizontal: MoreHorizontalDefinition,
  TextBoldIcon: TextBoldIconDefinition,
  TextItalicIcon: TextItalicIconDefinition,
  Heading02Icon: Heading02IconDefinition,
  LeftToRightListBulletIcon: LeftToRightListBulletIconDefinition,
  LeftToRightListNumberIcon: LeftToRightListNumberIconDefinition,
  SourceCodeIcon: SourceCodeIconDefinition,
  QuoteDownIcon: QuoteDownIconDefinition,
  MinusSignIcon: MinusSignIconDefinition,
  SidebarRightIcon: SidebarRightIconDefinition,
  DragDropVerticalIcon: DragDropVerticalIconDefinition,
  Menu01Icon: Menu01IconDefinition,
  ArrowRight02Icon: ArrowRight02IconDefinition,
  ArrowUpRight01Icon: ArrowUpRight01IconDefinition,
} satisfies Record<string, HugeIconDefinition>;

type PolterIconName = keyof typeof iconDefinitions;

// SAFETY: We map the exact keys of iconDefinitions to their corresponding HugeiconComponent.
const iconComponents = Object.fromEntries(
  Object.entries(iconDefinitions).map(([name, definition]) => [
    name,
    createHugeicon(definition),
  ]),
) as Record<PolterIconName, HugeiconComponent>;

export const {
  Activity,
  Activity03Icon,
  AddTeam,
  Archive,
  ArrowDataTransferVertical,
  ArrowDown,
  ArrowUp,
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
  XIcon,
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
  ExternalLink,
  Eye,
  ExpandIcon,
  File,
  FileDiff,
  FileText,
  FileUp,
  FloppyDisk,
  FingerAccessIcon,
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
  HelpCircle,
  History,
  InformationCircle,
  House,
  Inbox,
  KeyRound,
  Laptop,
  Layers,
  LayoutDashboard,
  LibraryBig,
  Link,
  Link2,
  ListChecks,
  ListFilter,
  ListOrdered,
  MapPin,
  Maximize2,
  MemoryStick,
  Monitor,
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
  Smartphone,
  Square,
  SquareChevronRight,
  SquareTerminal,
  StickyNote,
  Sun,
  Moon,
  Stop,
  Tag,
  Terminal,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Undo2,
  User,
  Warehouse,
  Webhook,
  Workflow,
  Wrench01Icon,
  X,
  Zap,
  MoreHorizontal,
  TextBoldIcon,
  TextItalicIcon,
  Heading02Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  SourceCodeIcon,
  QuoteDownIcon,
  MinusSignIcon,
  SidebarRightIcon,
  DragDropVerticalIcon,
  Menu01Icon,
  ArrowRight02Icon,
  ArrowUpRight01Icon,
} = iconComponents;

export const PlusIcon = Plus;
export const ExternalLinkIcon = ExternalLink;
