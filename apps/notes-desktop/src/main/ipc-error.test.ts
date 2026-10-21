import { Code, ConnectError } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { BadRequestSchema } from "@polterware/notes-contracts";
import { describe, expect, it } from "vitest";
import { publicIpcError } from "./ipc-error.js";

describe("public IPC errors", () => {
  it("puts invalid_argument field violation text on Error.message", () => {
    const error = new ConnectError("invalid argument", Code.InvalidArgument, undefined, [
      { desc: BadRequestSchema, value: create(BadRequestSchema, {
        violations: [
          { field: "dayStart", reason: "must be HH:MM" },
          { field: "calendar.weekStart", reason: "must be mon or sun" },
        ],
      }) },
    ]);
    const publicError = publicIpcError(error);
    expect(publicError.message).toContain("must be HH:MM");
    expect(publicError.message).toContain("must be mon or sun");
    expect(publicError.message).not.toContain("invalid_argument");
    expect(publicError.message).not.toContain("/Users/");
  });

  it("keeps stack traces and internal paths out of the message", () => {
    const error = new Error("failed to read /Users/erick/Library/Application Support/Polterware Notes/notes.db\n    at open (ipc.ts:12:3)");
    const publicError = publicIpcError(error);
    expect(publicError.message).not.toContain("/Users/");
    expect(publicError.message).not.toContain("notes.db");
    expect(publicError.message).not.toContain("ipc.ts");
    expect(publicError.message).toContain("[path]");
  });

  it("redacts bearer tokens from generic messages", () => {
    expect(publicIpcError(new Error("Authorization Bearer secret-token-value rejected")).message).not.toContain("secret-token-value");
  });
});
