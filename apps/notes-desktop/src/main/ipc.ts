import { fromJson, toJson, type DescService, type JsonValue, type Message } from "@bufbuild/protobuf";
import type { CoreClients } from "./core/client.js";
import { services } from "./core/client.js";
import { RPC_METHODS } from "../shared/channels.js";
import { publicIpcError } from "./ipc-error.js";

export const channel = (namespace: string, method: string) => `pwnotes:${namespace}:${method}`;
export function assertTrustedSender(event: { sender: unknown; senderFrame: unknown }, contents: { mainFrame: unknown }): void {
  if (event.sender !== contents || event.senderFrame !== contents.mainFrame) throw new Error("Untrusted IPC sender");
}
export function createRpcHandlers(options: {
  getClients: () => CoreClients;
  /** Resolves once the core startup attempt has settled; RPC calls wait for it so an early window can issue them. */
  whenReady?: Promise<unknown>;
  authorizePath: (purpose: "import" | "export" | "backup", path: string) => boolean;
  settingsChanged?: (settings: unknown) => void;
}) {
  const handlers: Record<string, (input: unknown) => Promise<JsonValue>> = {};
  for (const [namespace, methods] of Object.entries(RPC_METHODS)) {
    const service = services[namespace as keyof typeof services] as DescService;
    for (const methodName of methods) {
      const method = service.methods.find(candidate => candidate.localName === methodName);
      if (!method || method.methodKind !== "unary") throw new Error("Bridge contract mismatch");
      handlers[channel(namespace, methodName)] = async (raw = {}) => {
        try {
          if (!raw || typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(raw).length > 2_000_000) throw new Error("Invalid RPC input");
          const input = fromJson(method.input, raw as JsonValue, { ignoreUnknownFields: false });
          const fields = input as Message & Record<string, unknown>;
          if (namespace === "attachments" && methodName === "importFromPath" &&
            !options.authorizePath("import", String(fields.sourcePath))) throw new Error("Select attachment with the file dialog first");
          if (namespace === "maintenance" && methodName !== "doctor") {
            const purpose = methodName === "export" ? "export" : "backup";
            const path = String(fields[methodName === "export" ? "zipPath" : "destPath"]);
            if (!options.authorizePath(purpose, path)) throw new Error("Choose a destination with the save dialog first");
          }
          await options.whenReady;
          const client = options.getClients()[namespace as keyof typeof services] as unknown as Record<string, (input: Message, options: { timeoutMs: number }) => Promise<Message>>;
          const output = await client[methodName]!(input, { timeoutMs: 30_000 });
          if (namespace === "settings" && methodName === "set") options.settingsChanged?.(output);
          return toJson(method.output, output, { alwaysEmitImplicit: true });
        } catch (error) {
          throw publicIpcError(error);
        }
      };
    }
  }
  return handlers;
}

export function validateAppInput(method: string, input: unknown): void {
  if (["openDeepLink", "revealInFinder"].includes(method)) {
    if (typeof input !== "string" || input.length > 4096) throw new Error("Invalid app input");
    return;
  }
  if (method === "pathsForDroppedFiles") {
    if (!Array.isArray(input) || input.length > 64 || input.some(item => typeof item !== "string" || item.length > 4096)) {
      throw new Error("Invalid app input");
    }
    return;
  }
  if (method === "writeTempFile") {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid app input");
    const payload = input as { bytes?: unknown; name?: unknown };
    if (typeof payload.name !== "string" || payload.name.length === 0 || payload.name.length > 255) throw new Error("Invalid app input");
    if (!(payload.bytes instanceof Uint8Array)) throw new Error("Invalid app input");
    return;
  }
  if (method === "setReduceTransparency") {
    if (typeof input !== "boolean") throw new Error("Invalid app input");
    return;
  }
  if (input !== undefined) throw new Error("This app method takes no input");
}

export async function handleRequestNotificationAuthorization(
  reminders: { requestAuthorization(): Promise<boolean> },
): Promise<boolean> {
  return reminders.requestAuthorization();
}
