import { describe, expect, it, vi } from "vitest";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { BadRequestSchema, ListNotesResponseSchema, SaveSavedFilterResponseSchema } from "@polterware/notes-contracts";
import { services, type CoreClients } from "./core/client.js";
import { assertTrustedSender, validateAppInput, channel, createRpcHandlers, handleRequestNotificationAuthorization } from "./ipc.js";
import { RPC_METHODS } from "../shared/channels.js";
import { APP_METHODS } from "../shared/bridge.js";
const list = vi.fn(async () => create(ListNotesResponseSchema, {}));
const options = () => ({ getClients: () => ({ notes: { list } }) as unknown as CoreClients, authorizePath: () => false });
describe("IPC allowlist and schemas", () => {
  it("matches all frozen public unary services and no hidden core channels", () => {
    const handlers = createRpcHandlers(options());
    for (const [namespace, service] of Object.entries(services)) {
      expect([...RPC_METHODS[namespace as keyof typeof RPC_METHODS]].sort()).toEqual(service.methods.map(method => method.localName).sort());
    }
    expect(handlers["pwnotes:health:check"]).toBeUndefined();
    expect(handlers["pwnotes:core:endpoint"]).toBeUndefined();
  });
  it("validates unknown fields and scalar types before reaching the core", async () => {
    list.mockClear();
    const handler = createRpcHandlers(options())[channel("notes", "list")]!;
    await expect(handler({ endpoint: "http://evil" })).rejects.toThrow();
    await expect(handler({ limit: "not a number" })).rejects.toThrow();
    await expect(handler([])).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
    await expect(handler({ limit: 50 })).resolves.toMatchObject({ notes: [] });
    expect(list).toHaveBeenCalledOnce();
  });
  it("forwards saved filter writes as protobuf messages", async () => {
    const save = vi.fn(async (input: { surface: string; name: string; payloadJson: string }) =>
      create(SaveSavedFilterResponseSchema, { filter: { id: "f1", surface: input.surface, name: input.name, payloadJson: input.payloadJson } }));
    const handler = createRpcHandlers({ getClients: () => ({ savedFilters: { save } }) as unknown as CoreClients, authorizePath: () => false })[channel("savedFilters", "save")]!;
    await expect(handler({ surface: "notes.library", name: "Urgent", payload: {} })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    await expect(handler({ surface: "notes.library", name: "Urgent", payloadJson: "{\"version\":1}" }))
      .resolves.toMatchObject({ filter: { id: "f1", surface: "notes.library", name: "Urgent", payloadJson: "{\"version\":1}", position: 0 } });
    expect(save).toHaveBeenCalledOnce();
  });
  it("requires native dialog grants for import and maintenance writes", async () => {
    const handlers = createRpcHandlers(options());
    await expect(handlers[channel("attachments", "importFromPath")]!({ sourcePath: "/etc/passwd" })).rejects.toThrow("file dialog");
    await expect(handlers[channel("maintenance", "export")]!({ zipPath: "/etc/secret" })).rejects.toThrow("save dialog");
    await expect(handlers[channel("maintenance", "backup")]!({ destPath: "/etc/secret" })).rejects.toThrow("save dialog");
  });
  it("validates local app method inputs", () => {
    expect(() => validateAppInput("pickFiles", { path: "/etc/passwd" })).toThrow();
    expect(() => validateAppInput("startMicrophone", "camera")).toThrow();
    expect(() => validateAppInput("openDeepLink", 123)).toThrow();
    expect(() => validateAppInput("getInfo", undefined)).not.toThrow();
    expect(() => validateAppInput("requestNotificationAuthorization", undefined)).not.toThrow();
    expect(() => validateAppInput("requestNotificationAuthorization", true)).toThrow();
    expect(() => validateAppInput("pathsForDroppedFiles", ["/tmp/a.png"])).not.toThrow();
    expect(() => validateAppInput("pathsForDroppedFiles", { path: "/etc/passwd" })).toThrow();
    expect(() => validateAppInput("pathsForDroppedFiles", ["relative"])).not.toThrow();
    expect(() => validateAppInput("writeTempFile", { bytes: new Uint8Array([1]), name: "clip.webm" })).not.toThrow();
    expect(() => validateAppInput("writeTempFile", { bytes: "nope", name: "clip.webm" })).toThrow();
    expect(() => validateAppInput("writeTempFile", undefined)).toThrow();
    expect(() => validateAppInput("openLog", undefined)).not.toThrow();
    expect(() => validateAppInput("openLog", "/tmp/secret.log")).toThrow();
    expect(() => validateAppInput("openDataFolder", "/tmp")).toThrow();
    expect(() => validateAppInput("getReduceTransparency", undefined)).not.toThrow();
    expect(() => validateAppInput("setReduceTransparency", true)).not.toThrow();
    expect(() => validateAppInput("setReduceTransparency", false)).not.toThrow();
    expect(() => validateAppInput("setReduceTransparency", "true")).toThrow();
    expect(() => validateAppInput("setReduceTransparency", { enabled: true })).toThrow();
    expect(() => validateAppInput("testMcpConnection", undefined)).not.toThrow();
    expect(() => validateAppInput("testMcpConnection", { token: "secret" })).toThrow();
    expect(APP_METHODS).not.toContain("setLoginItem");
    expect(APP_METHODS).toEqual(expect.arrayContaining(["openLog", "openDataFolder", "getReduceTransparency", "setReduceTransparency", "testMcpConnection"]));
  });
  it("forwards notification authorization to the reminders controller", async () => {
    expect(APP_METHODS).toContain("requestNotificationAuthorization");
    const requestAuthorization = vi.fn(async () => true);
    await expect(handleRequestNotificationAuthorization({ requestAuthorization })).resolves.toBe(true);
    expect(requestAuthorization).toHaveBeenCalledOnce();
  });
  it("rejects iframes, foreign windows and absent senders", () => {
    const contents = { mainFrame: {} };
    expect(() => assertTrustedSender({ sender: contents, senderFrame: contents.mainFrame }, contents)).not.toThrow();
    expect(() => assertTrustedSender({ sender: {}, senderFrame: contents.mainFrame }, contents)).toThrow("Untrusted IPC sender");
    expect(() => assertTrustedSender({ sender: contents, senderFrame: {} }, contents)).toThrow("Untrusted IPC sender");
    expect(APP_METHODS).toEqual(expect.arrayContaining(["pathsForDroppedFiles", "writeTempFile"]));
  });
  it("exposes Connect invalid_argument field violations on Error.message", async () => {
    const set = vi.fn(async () => {
      throw new ConnectError("invalid argument", Code.InvalidArgument, undefined, [
        { desc: BadRequestSchema, value: create(BadRequestSchema, { violations: [{ field: "dayStart", reason: "must be HH:MM" }] }) },
      ]);
    });
    const handler = createRpcHandlers({
      getClients: () => ({ settings: { set } }) as unknown as CoreClients,
      authorizePath: () => false,
    })[channel("settings", "set")]!;
    await expect(handler({ keys: ["notifications.allDayTime"], settings: { notificationsAllDayTime: "25:00" } })).rejects.toThrow("must be HH:MM");
    const publicError = await handler({ keys: ["notifications.allDayTime"], settings: { notificationsAllDayTime: "25:00" } }).catch((error: unknown) => error);
    expect(publicError).toBeInstanceOf(Error);
    expect((publicError as Error).message).not.toMatch(/invalid_argument|\/Users\/|ipc\.ts/);
  });
});
