import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { create, toBinary } from "@bufbuild/protobuf";
import { CheckResponseSchema } from "@polterware/notes-contracts";
import { createCoreClients, validateEndpoint } from "./client.js";
describe("Connect clients", () => {
  it.each(["https://127.0.0.1:1234", "http://evil.example:1234", "http://127.0.0.1", "http://user:pass@127.0.0.1:1234", "http://127.0.0.1:1234/path"])("rejects unsafe endpoint %s", url => expect(() => validateEndpoint(url)).toThrow());
  it("authenticates real loopback HTTP and decodes the frozen schema", async () => {
    let auth = "", route = "";
    const server = createServer((request, response) => {
      auth = request.headers.authorization ?? ""; route = request.url ?? "";
      response.setHeader("Content-Type", "application/proto");
      response.end(toBinary(CheckResponseSchema, create(CheckResponseSchema, { build: "123-456", version: "0.1.0", dbPath: "/tmp/notes.db" })));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const client = createCoreClients(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, "test-session");
      expect((await client.health.check({})).build).toBe("123-456");
      expect(auth).toBe("Bearer test-session"); expect(route).toBe("/notes.v1.HealthService/Check");
    } finally { server.closeAllConnections(); await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())); }
  });
});
