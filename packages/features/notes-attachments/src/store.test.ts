import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAttachmentsBridge, type AttachmentsWireBridge } from "./bridge";
import { fakeBridge, NOTE_ID, PHOTO_ID, attachmentFixture, AUDIO_ID, FILE_ID, LINK_ID } from "./fake-bridge";
import { DROP_PATH_REFUSED, MAX_RECORDING_BYTES, MICROPHONE_DENIED, RECORDING_OVERSIZE } from "./model";
import { createAttachmentsStore } from "./store";

beforeEach(() => {
  class FakeRecorder { static isTypeSupported() { return true; } }
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
});

function storeFrom(fake = fakeBridge()) {
  return { ...fake, store: createAttachmentsStore(() => createAttachmentsBridge(fake.bridge as unknown as AttachmentsWireBridge)) };
}

describe("attachments store", () => {
  it("imports twenty mixed files with expectedRev and keeps core size/quota messages", async () => {
    const { store, bridge } = storeFrom(fakeBridge([]));
    const paths = Array.from({ length: 18 }, (_, index) => `/tmp/file-${index}.pdf`).concat(["/tmp/photo.png", "/tmp/clip.webm"]);
    vi.mocked(bridge.app.pickFiles).mockResolvedValueOnce(paths);
    await store.pickAndImport(NOTE_ID);
    expect(bridge.attachments.importFromPath).toHaveBeenCalledTimes(20);
    expect(vi.mocked(bridge.attachments.importFromPath).mock.calls[0]![0]).toMatchObject({ expectedRev: "1" });
    expect(store.items()).toHaveLength(20);
    expect(store.state()).toBe("live");
    await store.importPaths(NOTE_ID, ["/tmp/oversize.png", "/tmp/quota.bin"]);
    expect(store.state()).toBe("failed");
    expect(store.error()).toContain("attachment exceeds kind size limit");
    expect(store.error()).toContain("attachment quota exceeded");
  });
  it("imports two of three dropped files and reports the refused path", async () => {
    const { store, bridge } = storeFrom(fakeBridge([]));
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "refused.bin", { type: "application/octet-stream" }),
      new File(["c"], "c.txt", { type: "text/plain" }),
    ];
    await store.importDropped(NOTE_ID, files);
    expect(bridge.app.pathsForDroppedFiles).toHaveBeenCalledWith(files);
    expect(bridge.attachments.importFromPath).toHaveBeenCalledTimes(2);
    expect(vi.mocked(bridge.attachments.importFromPath).mock.calls.map(call => call[0]?.sourcePath)).toEqual(["/tmp/a.png", "/tmp/c.txt"]);
    expect(vi.mocked(bridge.attachments.importFromPath).mock.calls[0]![0]).toMatchObject({ noteId: NOTE_ID, expectedRev: "1" });
    expect(store.items()).toHaveLength(2);
    expect(store.state()).toBe("failed");
    expect(store.error()).toBe(DROP_PATH_REFUSED);
  });
  it("imports a finished recording through writeTempFile then importFromPath", async () => {
    const { store, bridge } = storeFrom(fakeBridge([]));
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm;codecs=opus" });
    await store.importRecording(NOTE_ID, blob);
    expect(bridge.app.writeTempFile).toHaveBeenCalledOnce();
    const [bytes, name] = vi.mocked(bridge.app.writeTempFile).mock.calls[0]!;
    expect(name).toBe("recording.webm");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(bridge.attachments.importFromPath).toHaveBeenCalledWith(expect.objectContaining({
      noteId: NOTE_ID, sourcePath: "/tmp/tmp-import/recording.webm", expectedRev: "1",
    }));
    expect(store.items()[0]?.kind).toBe("audio");
    expect(store.state()).toBe("live");
  });
  it("refuses an oversize recording before writeTempFile", async () => {
    const { store, bridge } = storeFrom(fakeBridge([]));
    const blob = {
      size: MAX_RECORDING_BYTES + 1,
      type: "audio/webm",
      arrayBuffer: vi.fn(async () => { throw new Error("should not read oversize bytes"); }),
    } as unknown as Blob;
    await store.importRecording(NOTE_ID, blob);
    expect(blob.arrayBuffer).not.toHaveBeenCalled();
    expect(bridge.app.writeTempFile).not.toHaveBeenCalled();
    expect(bridge.attachments.importFromPath).not.toHaveBeenCalled();
    expect(store.state()).toBe("failed");
    expect(store.error()).toBe(RECORDING_OVERSIZE);
  });
  it("surfaces microphone denied", async () => {
    const { store, bridge } = storeFrom(fakeBridge([]));
    vi.mocked(bridge.app.startMicrophone).mockResolvedValueOnce(false);
    expect(await store.requestMicrophone()).toBe("denied");
    expect(store.microphone()).toBe("denied");
    expect(store.microphoneCopy("denied")).toBe(MICROPHONE_DENIED);
  });
  it("adds links with expectedRev", async () => {
    const { store, bridge } = storeFrom(fakeBridge([]));
    await store.addLink(NOTE_ID, "https://example.com/page", "Example");
    expect(bridge.attachments.addLink).toHaveBeenCalledWith(expect.objectContaining({ expectedRev: "1", url: "https://example.com/page" }));
    expect(store.items()[0]?.kind).toBe("link");
  });
  it("deletes, reorders, and reveals through pwnotes-file URLs", async () => {
    const seed = [
      attachmentFixture(),
      attachmentFixture({ id: AUDIO_ID, kind: "audio", name: "clip.webm", mime: "audio/webm", relPath: `${NOTE_ID}/${AUDIO_ID}.webm`, sortOrder: 1 }),
      attachmentFixture({ id: FILE_ID, kind: "file", name: "notes.pdf", mime: "application/pdf", relPath: `${NOTE_ID}/${FILE_ID}.pdf`, sortOrder: 2 }),
      attachmentFixture({ id: LINK_ID, kind: "link", url: "https://example.com", title: "Example", relPath: undefined, sortOrder: 3 }),
    ];
    const { store, bridge } = storeFrom(fakeBridge(seed));
    await store.load(NOTE_ID);
    await store.move(NOTE_ID, 0, 1);
    expect(bridge.attachments.reorder).toHaveBeenCalledWith({ noteId: NOTE_ID, orderedIds: [AUDIO_ID, PHOTO_ID, FILE_ID, LINK_ID] });
    await store.reveal(store.items()[0]!);
    expect(bridge.app.revealInFinder).toHaveBeenCalledWith(`pwnotes-file://attachment/${NOTE_ID}/${AUDIO_ID}.webm`);
    await store.remove(NOTE_ID, FILE_ID);
    expect(bridge.attachments.delete).toHaveBeenCalledWith({ id: FILE_ID });
  });
});
