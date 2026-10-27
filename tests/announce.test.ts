import { describe, expect, it } from "vitest";
import { createAnnouncer, formatEvents, nextLiveText } from "../src/ui/announce";

describe("aria-live announcement batching", () => {
  it("joins multiple events from one tick instead of dropping all but the last", () => {
    expect(formatEvents(["HIT! HP 5/6", "EXIT UNLOCKED — 7/7 wardens down."])).toBe(
      "HIT! HP 5/6 EXIT UNLOCKED — 7/7 wardens down.",
    );
  });

  it("drops empty and duplicate copy within a batch", () => {
    expect(formatEvents(["WARDEN DOWN 1/7", "  ", "WARDEN DOWN 1/7", "WARDEN DOWN 2/7"])).toBe(
      "WARDEN DOWN 1/7 WARDEN DOWN 2/7",
    );
  });

  it("forces a visible-to-AT change when identical copy repeats", () => {
    const first = nextLiveText("", "WARDEN DOWN 1/7", false);
    expect(first).toBe("WARDEN DOWN 1/7");
    const repeatA = nextLiveText("WARDEN DOWN 1/7", "WARDEN DOWN 1/7", false);
    const repeatB = nextLiveText("WARDEN DOWN 1/7", "WARDEN DOWN 1/7", true);
    expect(repeatA).not.toBe("WARDEN DOWN 1/7");
    expect(repeatA).not.toBe(repeatB);
    expect(repeatA.replace(/\u200b/g, "")).toBe("WARDEN DOWN 1/7");
  });

  it("announcer writes fresh text once and alternates invisible suffixes on repeats", () => {
    const writes: string[] = [];
    const announce = createAnnouncer((text) => writes.push(text));
    announce("");
    announce("Paused.");
    announce("Paused.");
    announce("Resumed.");
    expect(writes[0]).toBe("Paused.");
    expect(writes[1].replace(/\u200b/g, "")).toBe("Paused.");
    expect(writes[1]).not.toBe(writes[0]);
    expect(writes[2]).toBe("Resumed.");
  });
});
