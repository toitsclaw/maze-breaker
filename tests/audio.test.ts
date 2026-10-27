import { describe, expect, it } from "vitest";
import { soundCues, type SoundSnapshot } from "../src/audio";

function snap(overrides: Partial<SoundSnapshot> = {}): SoundSnapshot {
  return {
    mode: "playing",
    hp: 100,
    kills: 0,
    exitOpen: false,
    muzzle: 0,
    hitmarker: 0,
    bob: 0,
    ...overrides,
  };
}

describe("sound cue derivation", () => {
  it("emits shot and hit feedback on timer edges", () => {
    expect(soundCues(snap(), snap({ muzzle: 0.1, hitmarker: 0.1 }))).toEqual(["shot", "hit"]);
  });

  it("uses a kill cue for a lethal hit", () => {
    expect(soundCues(snap(), snap({ kills: 1, hitmarker: 0.1 }))).toEqual(["kill"]);
  });

  it("emits hurt, unlock, victory, and defeat transitions once", () => {
    expect(soundCues(snap(), snap({ hp: 80 }))).toContain("hurt");
    expect(soundCues(snap(), snap({ exitOpen: true }))).toContain("unlock");
    expect(soundCues(snap(), snap({ mode: "victory" }))).toContain("victory");
    expect(soundCues(snap(), snap({ mode: "defeat" }))).toContain("defeat");
    expect(soundCues(snap({ mode: "victory" }), snap({ mode: "victory" }))).not.toContain("victory");
  });

  it("paces footsteps by walk phase and only while playing", () => {
    expect(soundCues(snap({ bob: 3 }), snap({ bob: 3.2 }))).toContain("step");
    expect(soundCues(snap({ bob: 3 }), snap({ mode: "paused", bob: 3.2 }))).not.toContain("step");
  });
});
