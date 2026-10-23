import { describe, expect, it, vi } from "vitest";
import { createFocusBridge, FOCUS_PHASE_KIND, type FocusWireBridge } from "./bridge";
import { ArmOneOffRequestSchema, RecordFocusSessionRequestSchema } from "@polterware/notes-contracts";
import { fromJson, toJson } from "@bufbuild/protobuf";

describe("protobuf JSON focus bridge", () => {
  it("sends RFC 3339 timestamps and the core focus_phase kind", async () => {
    const armOneOff = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({ kind: FOCUS_PHASE_KIND, fireAt: "2026-10-04T12:25:00.000Z", noteId: "note-1" });
      return { id: "one-1", fireAt: "2026-10-04T12:25:00.000Z" };
    });
    const recordSession = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({ phase: "work", plannedS: 1500, elapsedS: 1500, state: "completed", startedAt: "2026-10-04T12:00:00.000Z" });
      return { session: { id: "session-1", ...(input as object) } };
    });
    const bridge = createFocusBridge({
      focus: { recordSession }, reminders: { armOneOff }, settings: { get: async () => ({ settings: {} }) }, notes: { get: async () => ({}) },
      onChange: () => () => {},
    } as unknown as FocusWireBridge);
    await bridge.reminders.armOneOff({ kind: FOCUS_PHASE_KIND, noteId: "note-1", fireAt: "2026-10-04T12:25:00.000Z", title: "Focus complete", body: "Time for a break." });
    await bridge.focus.recordSession({
      phase: "work", plannedS: 1500, elapsedS: 1500, state: "completed",
      startedAt: "2026-10-04T12:00:00.000Z", endedAt: "2026-10-04T12:25:00.000Z",
    });
    expect(armOneOff).toHaveBeenCalledOnce();
    expect(recordSession).toHaveBeenCalledOnce();
  });

  it("round-trips RecordSession and ArmOneOff through protobuf JSON", () => {
    const session = toJson(RecordFocusSessionRequestSchema, fromJson(RecordFocusSessionRequestSchema, {
      phase: "short_break", plannedS: 300, elapsedS: 120, state: "stopped",
      startedAt: "2026-10-04T12:00:00.000Z", endedAt: "2026-10-04T12:02:00.000Z",
    }));
    expect(session).toMatchObject({ phase: "short_break", plannedS: 300, state: "stopped" });
    const armed = toJson(ArmOneOffRequestSchema, fromJson(ArmOneOffRequestSchema, {
      kind: FOCUS_PHASE_KIND, fireAt: "2026-10-04T12:25:00.000Z", title: "Focus complete",
    }));
    expect(armed).toMatchObject({ kind: FOCUS_PHASE_KIND });
    expect(String((armed as { fireAt: string }).fireAt)).toContain("2026-10-04T12:25:00");
  });
});
