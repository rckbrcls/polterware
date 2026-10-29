import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn(), on: vi.fn(), remove: vi.fn(), getPathForFile: vi.fn() }));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mock.expose },
  ipcRenderer: { invoke: mock.invoke, on: mock.on, removeListener: mock.remove },
  webUtils: { getPathForFile: mock.getPathForFile },
}));
import "./index.js";
import type { NotesDesktopBridge } from "../shared/bridge.js";
const exposedName = mock.expose.mock.calls[0]![0];
const bridge = mock.expose.mock.calls[0]![1] as NotesDesktopBridge;
describe("sandbox bridge", () => {
  it("exposes only the typed Polterware Notes API", () => {
    expect(exposedName).toBe("pwnotes");
    expect(bridge).not.toHaveProperty("ipcRenderer");
    expect(bridge).not.toHaveProperty("invoke");
    expect(bridge).not.toHaveProperty("endpoint");
    expect(bridge).not.toHaveProperty("token");
    expect(bridge.app).not.toHaveProperty("require");
    expect(bridge.app).not.toHaveProperty("process");
    expect(bridge.app).not.toHaveProperty("webUtils");
    expect(bridge).not.toHaveProperty("webUtils");
  });
  it("maps dropped Files in preload and writes temp files through Main", async () => {
    mock.getPathForFile.mockReturnValueOnce("/tmp/photo.png").mockReturnValueOnce("");
    const file = new File(["x"], "photo.png");
    const skipped = new File(["y"], "no-path.png");
    await bridge.app.pathsForDroppedFiles([file, skipped]);
    expect(mock.getPathForFile).toHaveBeenCalledWith(file);
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:pathsForDroppedFiles", ["/tmp/photo.png"]);
    const bytes = new Uint8Array([1, 2, 3]);
    await bridge.app.writeTempFile(bytes, "clip.webm");
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:writeTempFile", { bytes, name: "clip.webm" });
  });
  it("uses fixed channels", async () => {
    await bridge.notes.list();
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:notes:list", {});
  });
  it("maps saved filters to their core channels", async () => {
    await bridge.savedFilters.list({ surface: "notes.library" });
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:savedFilters:list", { surface: "notes.library" });
    await bridge.savedFilters.save({ surface: "notes.library", name: "Urgent", payloadJson: "{\"version\":1}" });
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:savedFilters:save", { surface: "notes.library", name: "Urgent", payloadJson: "{\"version\":1}" });
    await bridge.savedFilters.delete({ id: "f1" });
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:savedFilters:delete", { id: "f1" });
  });
  it("exposes notification authorization through the app allowlist", async () => {
    await bridge.app.requestNotificationAuthorization();
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:requestNotificationAuthorization", undefined);
  });
  it("maps new Main-owned app methods without taking renderer paths or tokens", async () => {
    await bridge.app.openLog();
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:openLog", undefined);
    await bridge.app.openDataFolder();
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:openDataFolder", undefined);
    await bridge.app.getReduceTransparency();
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:getReduceTransparency", undefined);
    await bridge.app.setReduceTransparency(true);
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:setReduceTransparency", true);
    await bridge.app.testMcpConnection();
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:testMcpConnection", undefined);
  });
  it("does not expose Electron events and unsubscribes exactly its listener", () => {
    const callback = vi.fn();
    const unsubscribe = bridge.onChange(callback);
    const [event, listener] = mock.on.mock.calls.at(-1)!;
    listener({ sender: "secret" }, { seq: "1", changes: [], resync: false });
    expect(callback).toHaveBeenCalledWith({ seq: "1", changes: [], resync: false });
    unsubscribe();
    expect(mock.remove).toHaveBeenCalledWith(event, listener);
  });
  it("delivers a cold-start deep link through onDeepLink without duplicating the same URL", async () => {
    mock.invoke.mockResolvedValueOnce({ url: "pwnotes://today", route: "/today" });
    const callback = vi.fn();
    const unsubscribe = bridge.app.onDeepLink(callback);
    const listener = mock.on.mock.calls.at(-1)![1] as (event: unknown, link: { url: string; route: string }) => void;
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith({ url: "pwnotes://today", route: "/today" }));
    expect(mock.invoke).toHaveBeenCalledWith("pwnotes:app:getDeepLink");
    listener({}, { url: "pwnotes://today", route: "/today" });
    expect(callback).toHaveBeenCalledTimes(1);
    listener({}, { url: "pwnotes://search?q=x", route: "/search?q=x" });
    expect(callback).toHaveBeenCalledWith({ url: "pwnotes://search?q=x", route: "/search?q=x" });
    unsubscribe();
  });
});
