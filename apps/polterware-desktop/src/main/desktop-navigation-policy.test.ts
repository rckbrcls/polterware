import { describe, expect, it } from "vitest";
import {
  canOpenExternalUrl,
  isAllowedRendererUrl,
} from "./desktop-navigation-policy.js";

describe("canOpenExternalUrl", () => {
  it("allows only http and https", () => {
    expect(canOpenExternalUrl("https://example.com/docs")).toBe(true);
    expect(canOpenExternalUrl("http://127.0.0.1:3000")).toBe(true);
    expect(canOpenExternalUrl("file:///tmp/secret")).toBe(false);
    expect(canOpenExternalUrl("ftp://example.com")).toBe(false);
    expect(canOpenExternalUrl("not-a-url")).toBe(false);
  });
});

describe("isAllowedRendererUrl", () => {
  it("rejects file drops and foreign origins when packaged", () => {
    const options = {
      isPackaged: true,
      packagedRendererPathname: "/app/renderer/index.html",
    };

    expect(isAllowedRendererUrl("file:///app/renderer/index.html", options)).toBe(true);
    expect(isAllowedRendererUrl("file:///tmp/dropped.md", options)).toBe(false);
    expect(isAllowedRendererUrl("https://evil.example", options)).toBe(false);
  });

  it("matches the Vite renderer URL in development", () => {
    const options = {
      isPackaged: false,
      rendererDevUrl: "http://localhost:5173/",
      packagedRendererPathname: "/unused",
    };

    expect(isAllowedRendererUrl("http://localhost:5173/", options)).toBe(true);
    expect(isAllowedRendererUrl("http://localhost:5173/other", options)).toBe(false);
    expect(isAllowedRendererUrl("file:///tmp/x", options)).toBe(false);
  });
});
