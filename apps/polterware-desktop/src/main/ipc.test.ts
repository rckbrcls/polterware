import { describe, expect, it, vi } from "vitest";
import { createPolterwareIpcHandlers } from "./ipc.js";
import { IPC_CHANNELS } from "../shared/ipc.js";

describe("createPolterwareIpcHandlers", () => {
  it("registers the public bridge surface", () => {
    const handlers = createPolterwareIpcHandlers();

    expect(handlers[IPC_CHANNELS.app.getInfo]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.listIcons]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.getIcon]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.setIcon]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.getShortcutPreferences]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.setShortcutPreferences]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.getAppearancePreferences]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.setAppearancePreferences]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.getMcpStatus]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.startMcp]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.stopMcp]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.openExternal]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.app.selectDirectory]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.commander.hideOverlay]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.commander.showMainWindow]).toBeTypeOf("function");
    expect(handlers[IPC_CHANNELS.commander.runCommand]).toBeTypeOf("function");
  });

  it("wires local app information when provided", async () => {
    const handlers = createPolterwareIpcHandlers({
      appInfo: { getInfo: () => ({ name: "Polterware", version: "0.1.0" }) },
    });

    await expect(handlers[IPC_CHANNELS.app.getInfo]()).resolves.toEqual({
      name: "Polterware",
      version: "0.1.0",
    });
  });

  it("wires Commander window controls when controllers are provided", async () => {
    const commander = {
      hideOverlay: vi.fn(),
      showMainWindow: vi.fn(),
      runCommand: vi.fn(),
    };
    const handlers = createPolterwareIpcHandlers({ commander });

    await handlers[IPC_CHANNELS.commander.hideOverlay]();
    await handlers[IPC_CHANNELS.commander.showMainWindow]();
    await handlers[IPC_CHANNELS.commander.runCommand](undefined, { id: "nav.architecture" });

    expect(commander.hideOverlay).toHaveBeenCalledOnce();
    expect(commander.showMainWindow).toHaveBeenCalledOnce();
    expect(commander.runCommand).toHaveBeenCalledWith("nav.architecture");
  });

  it("wires app icon controls when controllers are provided", async () => {
    const appIcons = {
      getIcon: vi.fn().mockReturnValue({
        defaultId: "black",
        icon: {
          id: "black",
          label: "Black",
          previewDataUrl: "data:image/png;base64,YmxhY2s=",
        },
        selectedId: "black",
      }),
      listIcons: vi.fn().mockReturnValue([
        {
          id: "black",
          label: "Black",
          previewDataUrl: "data:image/png;base64,YmxhY2s=",
        },
      ]),
      setIcon: vi.fn().mockReturnValue({
        defaultId: "black",
        icon: {
          id: "white",
          label: "White",
          previewDataUrl: "data:image/png;base64,d2hpdGU=",
        },
        selectedId: "white",
      }),
    };
    const handlers = createPolterwareIpcHandlers({ appIcons });

    await handlers[IPC_CHANNELS.app.listIcons]();
    await handlers[IPC_CHANNELS.app.getIcon]();
    await handlers[IPC_CHANNELS.app.setIcon](undefined, { id: "white" });

    expect(appIcons.listIcons).toHaveBeenCalledOnce();
    expect(appIcons.getIcon).toHaveBeenCalledOnce();
    expect(appIcons.setIcon).toHaveBeenCalledWith("white");
  });

  it("wires shortcut preference controls when controllers are provided", async () => {
    const shortcutPreferences = {
      getPreferences: vi.fn().mockReturnValue({ version: 1, overrides: {} }),
      setPreferences: vi.fn().mockReturnValue({
        version: 1,
        overrides: { "shell.toggle_commander": "mod+p" },
      }),
    };
    const handlers = createPolterwareIpcHandlers({ shortcutPreferences });

    await handlers[IPC_CHANNELS.app.getShortcutPreferences]();
    await handlers[IPC_CHANNELS.app.setShortcutPreferences](undefined, {
      overrides: { "shell.toggle_commander": "mod+p" },
    });

    expect(shortcutPreferences.getPreferences).toHaveBeenCalledOnce();
    expect(shortcutPreferences.setPreferences).toHaveBeenCalledWith({
      "shell.toggle_commander": "mod+p",
    });
  });

  it("wires MCP helper controls when controllers are provided", async () => {
    const mcp = {
      getStatus: vi.fn().mockReturnValue({
        running: false,
        pid: null,
        dbPath: "/tmp/local.db",
        command: "polterware mcp",
        cursorConfig: "{}",
      }),
      start: vi.fn().mockResolvedValue({
        running: true,
        pid: 42,
        dbPath: "/tmp/local.db",
        command: "polterware mcp",
        cursorConfig: "{}",
      }),
      stop: vi.fn().mockResolvedValue({
        running: false,
        pid: null,
        dbPath: "/tmp/local.db",
        command: "polterware mcp",
        cursorConfig: "{}",
      }),
    };
    const handlers = createPolterwareIpcHandlers({ mcp });

    await handlers[IPC_CHANNELS.app.getMcpStatus]();
    await handlers[IPC_CHANNELS.app.startMcp]();
    await handlers[IPC_CHANNELS.app.stopMcp]();

    expect(mcp.getStatus).toHaveBeenCalledOnce();
    expect(mcp.start).toHaveBeenCalledOnce();
    expect(mcp.stop).toHaveBeenCalledOnce();
  });

  it("wires directory selection when appShell is provided", async () => {
    const appShell = {
      openExternal: vi.fn(),
      selectDirectory: vi.fn().mockResolvedValue({ path: "/Users/demo/project" }),
    };
    const handlers = createPolterwareIpcHandlers({ appShell });

    await expect(handlers[IPC_CHANNELS.app.selectDirectory]()).resolves.toEqual({
      path: "/Users/demo/project",
    });
    expect(appShell.selectDirectory).toHaveBeenCalledOnce();
  });

  it("rejects core channels when the core controller is missing", async () => {
    const handlers = createPolterwareIpcHandlers();
    await expect(handlers[IPC_CHANNELS.core.listProjects]()).rejects.toThrow(/not connected/);
  });
});
