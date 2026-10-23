import type { CommandDef, RouteDef, SidebarItemDef, NotesFeature } from "./feature";

export const DEFAULT_PATH = "/today";
export const SHELL_ROUTES = [
  { path: "/inbox", title: "Inbox", icon: "Inbox" },
  { path: "/today", title: "Today", icon: "CalendarClock" },
  { path: "/calendar", title: "Calendar", icon: "CalendarClock" },
  { path: "/spaces", title: "Spaces", icon: "Folder" },
  { path: "/map", title: "Map", icon: "MapPin" },
  { path: "/focus", title: "Focus", icon: "Clock" },
  { path: "/search", title: "Search", icon: "Search" },
] as const;

export function normalizePath(raw: string): string {
  const path = raw.split(/[?#]/)[0]?.replace(/\/+$/, "") || DEFAULT_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}
export function matchPath(pattern: string, raw: string): Record<string, string> | null {
  const segments = normalizePath(pattern).split("/");
  const values = normalizePath(raw).split("/");
  if (segments.length !== values.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.startsWith(":")) {
      try { params[segment.slice(1)] = decodeURIComponent(values[i]!); } catch { return null; }
    } else if (segment !== values[i]) return null;
  }
  return params;
}
export function resolveRoute(features: readonly NotesFeature[], path: string): { route: RouteDef; params: Record<string, string> } | undefined {
  for (const feature of [...features.filter(feature => feature.id !== "shell"), ...features.filter(feature => feature.id === "shell")]) {
    for (const route of feature.routes) {
      const params = matchPath(route.path, path);
      if (params) return { route, params };
    }
  }
}
export function sidebarItems(features: readonly NotesFeature[]): SidebarItemDef[] {
  const contributed = features.flatMap(feature => feature.sidebar ?? []);
  const items: SidebarItemDef[] = SHELL_ROUTES.filter(route => route.path !== "/search" && route.path !== "/today").map(route => (
    contributed.find(item => normalizePath(item.path) === route.path) ?? {
      id: route.path.slice(1), label: route.title, path: route.path, icon: route.icon,
    }
  ));
  return [...items, ...contributed.filter(item => !items.some(existing => normalizePath(existing.path) === normalizePath(item.path)))]
    .filter(item => normalizePath(item.path) !== "/today");
}
export function findCommands(commands: readonly CommandDef[], query: string): CommandDef[] {
  const words = query.trim().toLowerCase().split(/\s+/);
  return commands.filter(command => words.every(word => `${command.label} ${command.keywords?.join(" ") ?? ""}`.toLowerCase().includes(word)));
}
export type RouteHistory = { entries: string[]; index: number };
export function pushRoute(history: RouteHistory, path: string): RouteHistory {
  const query = path.includes("?") ? `?${path.split("?").slice(1).join("?")}` : "";
  const next = `${normalizePath(path)}${query}`;
  if (history.entries[history.index] === next) return history;
  const entries = [...history.entries.slice(0, history.index + 1), next];
  return { entries, index: entries.length - 1 };
}
export function deepLinkPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "pwnotes:") return null;
    const path = normalizePath(`/${url.host}${url.pathname}`);
    if (/^\/(note|space)\/[^/]+$/.test(path) || SHELL_ROUTES.some(route => route.path === path) || path === "/settings") return path;
    return null;
  } catch { return null; }
}
