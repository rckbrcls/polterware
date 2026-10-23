import { describe, expect, it } from "vitest";
import { DROP_PATH_REFUSED, MAX_RECORDING_BYTES, linkHost, previewUrl, recordingFileName, reorderIds, revisionString } from "./model";

const note = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const file = "01ARZ3NDEKTSV4RRFFQ69G5FB0.png";

describe("attachment preview URLs", () => {
  it("builds pwnotes-file URLs from a two-segment relPath and rejects file://", () => {
    expect(previewUrl(`${note}/${file}`)).toBe(`pwnotes-file://attachment/${note}/${file}`);
    expect(previewUrl(`${note}\\${file}`)).toBe(`pwnotes-file://attachment/${note}/${file}`);
    expect(previewUrl("/etc/passwd")).toBeUndefined();
    expect(previewUrl(`file://${note}/${file}`)).toBeUndefined();
    expect(previewUrl(undefined)).toBeUndefined();
    expect(previewUrl(`${note}/${file}`)?.startsWith("file:")).toBe(false);
  });
  it("maps MediaRecorder mime types to a basename Main accepts", () => {
    expect(recordingFileName("audio/webm;codecs=opus")).toBe("recording.webm");
    expect(recordingFileName("audio/wav")).toBe("recording.wav");
    expect(recordingFileName("audio/mpeg")).toBe("recording.mp3");
    expect(recordingFileName("audio/mp4")).toBe("recording.m4a");
    expect(recordingFileName("audio/ogg")).toBe("recording.ogg");
    expect(recordingFileName("audio/aac")).toBe("recording.aac");
    expect(recordingFileName(undefined)).toBe("recording.webm");
    expect(() => recordingFileName("audio/flac")).toThrow(/audio extension/);
    expect(MAX_RECORDING_BYTES).toBe(100 * 1024 * 1024);
    expect(DROP_PATH_REFUSED).toContain("granted path");
  });
  it("reorders ids without dropping entries and exposes link hosts without a favicon", () => {
    expect(reorderIds(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(reorderIds(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(linkHost("https://example.com/path")).toBe("example.com");
    expect(revisionString(9007199254740993n)).toBe("9007199254740993");
    expect(revisionString(undefined)).toBe("0");
  });
});
