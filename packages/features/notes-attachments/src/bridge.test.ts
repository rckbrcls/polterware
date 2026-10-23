import { describe, expect, it, vi } from "vitest";
import { createAttachmentsBridge, revisionString, type AttachmentsWireBridge } from "./bridge";

describe("protobuf JSON attachment bridge", () => {
  it("sends expectedRev as a decimal string on ImportFromPath and AddLink", async () => {
    const importFromPath = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({ noteId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", sourcePath: "/tmp/a.png", expectedRev: "9007199254740993" });
      expect(typeof (input as { expectedRev: string }).expectedRev).toBe("string");
      return { attachment: { id: "01ARZ3NDEKTSV4RRFFQ69G5FB0", noteId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", kind: "photo", sizeBytes: "12", createdAt: "2026-10-04T12:00:00.000Z" } };
    });
    const addLink = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({ expectedRev: "2", url: "https://example.com" });
      return { attachment: { id: "01ARZ3NDEKTSV4RRFFQ69G5FB1", kind: "link", url: "https://example.com" } };
    });
    const bridge = createAttachmentsBridge({
      attachments: { importFromPath, addLink, list: async () => ({ attachments: [] }), delete: async () => ({}), reorder: async () => ({ attachments: [] }), openInfo: async () => ({ id: "", absolutePath: "", mime: "", name: "", kind: "" }) },
      notes: { get: async () => ({ note: { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", rev: "9007199254740993" } }) },
      settings: { get: async () => ({ settings: { linksFetchTitles: false } }) },
      onChange: () => () => {},
      app: { pickFiles: async () => [], pathsForDroppedFiles: async () => [], writeTempFile: async () => "", revealInFinder: async () => {}, startMicrophone: async () => false },
    } as unknown as AttachmentsWireBridge);
    const imported = await bridge.attachments.importFromPath({ noteId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", sourcePath: "/tmp/a.png", name: "a.png", expectedRev: "9007199254740993" });
    expect(imported.attachment?.sizeBytes).toBe("12");
    expect(imported.attachment?.createdAt).toBe("2026-10-04T12:00:00.000Z");
    await bridge.attachments.addLink({ noteId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", url: "https://example.com", title: "", expectedRev: "2" });
    expect(addLink).toHaveBeenCalledOnce();
  });
  it("canonicalizes numeric expectedRev to a string before the wire", async () => {
    const importFromPath = vi.fn(async () => ({ attachment: { id: "x", kind: "file" } }));
    const bridge = createAttachmentsBridge({
      attachments: { importFromPath },
      notes: {}, settings: {},
      onChange: () => () => {},
      app: { pickFiles: async () => [], pathsForDroppedFiles: async () => [], writeTempFile: async () => "", revealInFinder: async () => {}, startMicrophone: async () => false },
    } as unknown as AttachmentsWireBridge);
    await bridge.attachments.importFromPath({ noteId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", sourcePath: "/tmp/a.png", expectedRev: 1 as never });
    const sent = (importFromPath.mock.calls as unknown as [{ expectedRev: string }][])[0]![0]!;
    expect(sent.expectedRev).toBe("1");
    expect(typeof sent.expectedRev).toBe("string");
    expect(revisionString(4n)).toBe("4");
  });
});
