import {
  Activity, AddTeam, AiBrain01Icon, AiSearchIcon, Bell, CalendarClock, Cloud, Cog, Cpu, CreditCard, Database, FileText,
  FirewallIcon, Gauge, Globe, Globe2, GridTableIcon, HardDrive, Inbox, InfinityIcon, Key01Icon, KeyRound, ListOrdered,
  McpServerIcon, MemoryStick, Monitor, Network, Plug, RoboticIcon, Route, ScrollText, Search, Server, SlidersHorizontalIcon,
  Smartphone, SquareLock02Icon, SquareTerminal, User, Warehouse, Webhook, Workflow, Zap, type HugeiconComponent,
} from "@polterware/frontend-design-system";

/** Kind icons stay apart from the registry so plain model code does not load the design system. */
export const componentIcons: Readonly<Record<string, HugeiconComponent>> = {
  frontend: Globe, mobile: Smartphone, desktop: Monitor, cli: SquareTerminal,
  service: Server, api: Plug, gateway: Network, worker: Cog, function: Zap, scheduler: CalendarClock,
  database: Database, cache: MemoryStick, queue: ListOrdered, stream: Activity, storage: HardDrive, search: Search, warehouse: Warehouse,
  auth: KeyRound, cdn: Globe2, cluster: Cpu, monitoring: Gauge,
  external: Cloud, llm: AiBrain01Icon, payment: CreditCard, email: Inbox,
  user: User, team: AddTeam,
  agent: RoboticIcon, mcp: McpServerIcon, vector: AiSearchIcon,
  secrets: SquareLock02Icon, firewall: FirewallIcon, kms: Key01Icon,
  logs: ScrollText, tracing: Route, alerting: Bell,
  pipeline: Workflow, ci: InfinityIcon, webhook: Webhook,
  config: SlidersHorizontalIcon, spec: FileText, dataset: GridTableIcon,
};
