import { describe, expect, it, vi } from "vitest";
import { createNotesBridge, revisionString, type NotesWireBridge } from "./bridge";
import { UpdateNoteRequestSchema } from "@polterware/notes-contracts";
import { fromJson, toJson } from "@bufbuild/protobuf";

describe("protobuf JSON note bridge", () => {
  it("sends expectedRev as a decimal string and keeps RFC 3339 timestamps", async () => {
    const update = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({ id: "note-1", expectedRev: "9007199254740993", content: "Local" });
      expect(typeof (input as { expectedRev: string }).expectedRev).toBe("string");
      return { note: { id: "note-1", content: "Local", rev: "9007199254740994", dueAt: "2026-10-04T12:00:00.000Z" } };
    });
    const bridge = createNotesBridge({
      notes: { update },
      spaces: {}, tags: {}, activity: {}, schedule: {},
      onChange: () => () => {},
      app: { openDeepLink: async () => {} },
    } as unknown as NotesWireBridge);
    const result = await bridge.notes.update({ id: "note-1", expectedRev: "9007199254740993", content: "Local" });
    expect(result.note?.rev).toBe("9007199254740994");
    expect(result.note?.dueAt).toBe("2026-10-04T12:00:00.000Z");
    expect(update).toHaveBeenCalledOnce();
  });
  it("canonicalizes numeric expectedRev to a string before the wire", async () => {
    const update = vi.fn(async () => ({ note: { id: "note-1", rev: "2" } }));
    const bridge = createNotesBridge({
      notes: { update },
      spaces: {}, tags: {}, activity: {}, schedule: {},
      onChange: () => () => {},
      app: { openDeepLink: async () => {} },
    } as unknown as NotesWireBridge);
    await bridge.notes.update({ id: "note-1", expectedRev: 1 as never, title: "T" });
    expect(update).toHaveBeenCalled();
    const sent = (update.mock.calls as unknown as [{ expectedRev: string }][])[0]![0]!;
    expect(sent.expectedRev).toBe("1");
    expect(typeof sent.expectedRev).toBe("string");
  });
  it("round-trips UpdateNoteRequest through protobuf JSON", () => {
    const json = toJson(UpdateNoteRequestSchema, fromJson(UpdateNoteRequestSchema, {
      id: "note-1", expectedRev: "12", content: "Draft",
    }));
    expect(json).toMatchObject({ id: "note-1", expectedRev: "12", content: "Draft" });
    expect(typeof (json as { expectedRev: string }).expectedRev).toBe("string");
  });
  it("normalizes missing revisions to 0 without using numbers", () => {
    expect(revisionString(undefined)).toBe("0");
    expect(revisionString(9007199254740993n)).toBe("9007199254740993");
    expect(revisionString("4")).toBe("4");
  });
});
