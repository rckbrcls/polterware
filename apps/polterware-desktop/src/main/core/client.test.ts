import { describe, expect, it } from "vitest";
import { decodeBase64Bytes, toJsonObject } from "./client.js";

describe("toJsonObject", () => {
  it("encodes Uint8Array protobuf bytes as base64", () => {
    const encoded = toJsonObject({
      data: new TextEncoder().encode("smoke-ok"),
      nextOffset: 8n,
      closed: false,
    });
    expect(encoded.data).toBe(Buffer.from("smoke-ok", "utf8").toString("base64"));
    expect(encoded.nextOffset).toBe(8);
    expect(encoded.closed).toBe(false);
  });

  it("encodes Node Buffer bytes as base64", () => {
    const encoded = toJsonObject({ data: Buffer.from("hi") });
    expect(encoded.data).toBe(Buffer.from("hi").toString("base64"));
  });
});

describe("decodeBase64Bytes", () => {
  it("decodes base64 strings from the renderer", () => {
    const bytes = decodeBase64Bytes(Buffer.from("a", "utf8").toString("base64"));
    expect(bytes).toEqual(new Uint8Array([97]));
  });

  it("passes through Uint8Array", () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(decodeBase64Bytes(input)).toBe(input);
  });
});
