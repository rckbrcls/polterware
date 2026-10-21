import { describe, expect, it } from "vitest";
import {
  buildDesktopContextMenuTemplate,
  type DesktopContextMenuParams,
} from "./desktop-context-menu.js";

function collectRoles(template: ReturnType<typeof buildDesktopContextMenuTemplate>): string[] {
  const roles: string[] = [];
  for (const item of template) {
    if (item.role !== undefined && item.role !== null) {
      roles.push(item.role);
    }
  }
  return roles;
}

function params(partial: Partial<DesktopContextMenuParams>): DesktopContextMenuParams {
  return {
    isEditable: false,
    selectionText: "",
    editFlags: {},
    ...partial,
  };
}

describe("buildDesktopContextMenuTemplate", () => {
  it("builds an edit menu for editable targets", () => {
    const roles = collectRoles(
      buildDesktopContextMenuTemplate(
        params({
          isEditable: true,
          editFlags: {
            canUndo: true,
            canRedo: false,
            canCut: true,
            canCopy: true,
            canPaste: true,
            canSelectAll: true,
          },
        }),
      ),
    );

    expect(roles).toEqual(["undo", "redo", "cut", "copy", "paste", "selectAll"]);
    expect(roles).not.toContain("reload");
    expect(roles).not.toContain("toggleDevTools");
    expect(roles).not.toContain("inspect");
  });

  it("offers copy for non-editable text selection", () => {
    const template = buildDesktopContextMenuTemplate(
      params({
        selectionText: "  copy me  ",
        editFlags: { canCopy: true },
      }),
    );

    expect(collectRoles(template)).toEqual(["copy"]);
  });

  it("returns no menu for chrome without selection", () => {
    expect(buildDesktopContextMenuTemplate(params({}))).toEqual([]);
  });
});
