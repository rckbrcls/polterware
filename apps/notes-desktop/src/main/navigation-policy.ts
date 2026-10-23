import type { DeepLink } from "../shared/bridge.js";
export const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function parseDeepLink(raw: string): DeepLink | null {
  try {
    if (raw.length > 4096) return null;
    const url = new URL(raw);
    if (url.protocol !== "pwnotes:" || url.username || url.password || url.port || url.hash) return null;
    const params = [...url.searchParams.keys()];
    let route: string;
    switch (url.hostname) {
      case "note": {
        const id = url.pathname.slice(1);
        if (!ULID.test(id) || params.some(key => key !== "action") || url.searchParams.getAll("action").length > 1 ||
          (url.searchParams.has("action") && url.searchParams.get("action") !== "focus")) return null;
        route = `/note/${id}${url.search}`; break;
      }
      case "today":
        if ((url.pathname && url.pathname !== "/") || params.length) return null;
        route = "/today"; break;
      case "calendar": {
        if ((url.pathname && url.pathname !== "/") || params.some(key => key !== "date") || url.searchParams.getAll("date").length > 1) return null;
        const date = url.searchParams.get("date");
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date)) return null;
        route = `/calendar${url.search}`; break;
      }
      case "search":
        if ((url.pathname && url.pathname !== "/") || params.some(key => key !== "q") || url.searchParams.getAll("q").length > 1) return null;
        route = `/search${url.search}`; break;
      case "focus":
        if ((url.pathname && url.pathname !== "/") || params.length) return null;
        route = "/focus"; break;
      case "map":
        if ((url.pathname && url.pathname !== "/") || params.length) return null;
        route = "/map"; break;
      default: return null;
    }
    return { url: url.href, route };
  } catch { return null; }
}
export function isAllowedRendererUrl(raw: string, documentUrl: string): boolean {
  try {
    const url = new URL(raw), expected = new URL(documentUrl);
    return url.protocol === expected.protocol && url.host === expected.host && url.pathname === expected.pathname &&
      !url.username && !url.password;
  } catch { return false; }
}
export function canOpenExternalUrl(raw: string): boolean {
  try { const url = new URL(raw); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
export function contentSecurityPolicy(_onlineMaps = true, _development = false, geocoding = false): string {
  return ["default-src 'none'", "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob: pwnotes-file: https://tiles.openfreemap.org",
    "media-src 'self' blob: pwnotes-file:",
    `connect-src 'self' https://tiles.openfreemap.org${geocoding ? " https://nominatim.openstreetmap.org" : ""}`,
    "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "frame-src 'none'", "form-action 'none'"].join("; ");
}
