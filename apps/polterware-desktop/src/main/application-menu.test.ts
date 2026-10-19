import { describe, expect, it } from "vitest";
import { buildApplicationMenuTemplate } from "./application-menu.js";

function collectRoles(
  items: ReturnType<typeof buildApplicationMenuTemplate>,
): string[] {
  const roles: string[] = [];
  for (const item of items) {
    if (typeof item.role === "string") {
      roles.push(item.role);
    }
    if (Array.isArray(item.submenu)) {
      for (const child of item.submenu) {
        if (typeof child.role === "string") {
          roles.push(child.role);
        }
      }
    }
  }
  return roles;
}

describe("buildApplicationMenuTemplate", () => {
  it("omits reload, DevTools, and zoom roles when packaged", () => {
    const roles = collectRoles(
      buildApplicationMenuTemplate({ isPackaged: true, platform: "darwin" }),
    );

    expect(roles).not.toContain("reload");
    expect(roles).not.toContain("forceReload");
    expect(roles).not.toContain("toggleDevTools");
    expect(roles).not.toContain("zoomIn");
    expect(roles).not.toContain("zoomOut");
    expect(roles).not.toContain("resetZoom");
    expect(roles).toContain("togglefullscreen");
    expect(roles).toContain("editMenu");
  });

  it("includes reload and DevTools only when unpackaged", () => {
    const roles = collectRoles(
      buildApplicationMenuTemplate({ isPackaged: false, platform: "darwin" }),
    );

    expect(roles).toContain("reload");
    expect(roles).toContain("toggleDevTools");
    expect(roles).not.toContain("zoomIn");
    expect(roles).not.toContain("zoomOut");
    expect(roles).not.toContain("resetZoom");
    expect(roles).not.toContain("forceReload");
  });

  it("uses a File quit entry on Windows instead of appMenu", () => {
    const template = buildApplicationMenuTemplate({
      isPackaged: true,
      platform: "win32",
    });
    const roles = collectRoles(template);

    expect(roles).not.toContain("appMenu");
    expect(roles).toContain("quit");
    expect(template[0]?.label).toBe("File");
  });
});
