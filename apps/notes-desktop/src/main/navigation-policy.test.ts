import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canOpenExternalUrl, contentSecurityPolicy, isAllowedRendererUrl, parseDeepLink } from "./navigation-policy.js";
const id = "01K6N3QWJ8P9A7B6C5D4E3F2G1";
describe("navigation policy", () => {
  it.each([`pwnotes://note/${id}`, `pwnotes://note/${id}?action=focus`, "pwnotes://today", "pwnotes://focus", "pwnotes://map", "pwnotes://calendar?date=2026-10-04", "pwnotes://search?q=hello"])("routes %s", url => expect(parseDeepLink(url)?.route).toMatch(/^\//));
  it("routes the Start focus command to /focus", () => expect(parseDeepLink("pwnotes://focus")).toEqual({ url: "pwnotes://focus", route: "/focus" }));
  it("routes the Map command to /map", () => expect(parseDeepLink("pwnotes://map")).toEqual({ url: "pwnotes://map", route: "/map" }));
  it.each(["https://today", "pwnotes://other", "pwnotes://note/../today", "pwnotes://note/bad", `pwnotes://note/${id}?action=delete`,
    "pwnotes://calendar?date=2026-02-30", "pwnotes://today?token=x", "pwnotes://today#script", "pwnotes://user@today", "pwnotes://search?q=x&q=y",
    "pwnotes://focus?token=x", "pwnotes://focus/extra", "pwnotes://map?token=x", "pwnotes://map/extra"])("rejects %s", url => expect(parseDeepLink(url)).toBeNull());
  it("limits renderer navigation to its document", () => {
    const doc = "http://localhost:5173/";
    expect(isAllowedRendererUrl(`${doc}?surface=x#/today`, doc)).toBe(true);
    expect(isAllowedRendererUrl("http://evil.example/", doc)).toBe(false);
    expect(isAllowedRendererUrl("http://localhost:5173/other", doc)).toBe(false);
    expect(isAllowedRendererUrl("file:///tmp/secret", "file:///app/index.html")).toBe(false);
    expect(isAllowedRendererUrl("file:///app/index.html#/today", "file:///app/index.html")).toBe(true);
  });
  it.each(["javascript:alert(1)", "file:///etc/passwd", "pwnotes://today", "https://user:pass@example.com"])("blocks external %s", url => expect(canOpenExternalUrl(url)).toBe(false));
  it("opens only HTTP(S) in the system browser", () => expect(canOpenExternalUrl("https://example.com")).toBe(true));
  it("always allows OpenFreeMap resources and disallows remote scripts", () => {
    expect(contentSecurityPolicy(false)).toContain("connect-src 'self' https://tiles.openfreemap.org");
    expect(contentSecurityPolicy(false)).toContain("img-src 'self' data: blob: pwnotes-file: https://tiles.openfreemap.org");
    expect(contentSecurityPolicy(false)).toContain("worker-src 'self' blob:");
    expect(contentSecurityPolicy(true)).toContain("script-src 'self';");
    expect(contentSecurityPolicy(false)).not.toContain("unsafe-eval");
  });
  it("adds Nominatim to connect-src only while geocoding is enabled", () => {
    expect(contentSecurityPolicy(false)).not.toContain("nominatim.openstreetmap.org");
    expect(contentSecurityPolicy(true)).not.toContain("nominatim.openstreetmap.org");
    expect(contentSecurityPolicy(false, false, true)).toContain("https://nominatim.openstreetmap.org");
    expect(contentSecurityPolicy(true, false, true)).toContain("https://tiles.openfreemap.org https://nominatim.openstreetmap.org");
    expect(contentSecurityPolicy(true, false, true)).not.toContain("http://127.0.0.1");
    expect(contentSecurityPolicy(false, true, true)).not.toMatch(/connect-src[^;]*http:\/\/127\.0\.0\.1/);
  });
  it("has no wildcard or loopback exception in any policy mode", () => {
    for (const development of [false, true]) for (const online of [false, true]) for (const geocoding of [false, true]) {
      const policy = contentSecurityPolicy(online, development, geocoding);
      expect(policy).not.toMatch(/\*|127\.0\.0\.1|localhost|\[::1\]/);
      expect(policy.includes("nominatim.openstreetmap.org")).toBe(geocoding);
    }
  });
  it("rejects malformed, nested, encoded and oversized deep links", () => {
    for (const raw of ["pwnotes://note/%2e%2e/%2e%2e/etc", "pwnotes://note/%252e%252e", "pwnotes://today/%00", "pwnotes://calendar?date=%FF", "pwnotes://today:123", "pwnotes://today?next=pwnotes%3A%2F%2Fnote%2Fbad", "pwnotes://search?q=" + "x".repeat(4096), "pwnotes://note/" + "%".repeat(512)]) {
      expect(parseDeepLink(raw)).toBeNull();
    }
  });
  it("does not ship a document CSP meta; Main owns the enforced policy", () => {
    const html = readFileSync(new URL("../renderer/index.html", import.meta.url), "utf8");
    expect(html).not.toMatch(/http-equiv=["']Content-Security-Policy["']/i);
  });
});
