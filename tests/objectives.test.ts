import { describe, expect, it } from "vitest";
import {
  beginPlay,
  createGame,
  pauseGame,
  resetGame,
  resumeGame,
  stepGame,
  type StepInput,
} from "../src/game/state";
import { PLAYER_MAX_HP } from "../src/game/constants";

const IDLE: StepInput = { moveX: 0, moveY: 0, yawDelta: 0, fire: false };
const FIRE: StepInput = { moveX: 0, moveY: 0, yawDelta: 0, fire: true };
const STEP = 1 / 60;

/** Position the player at the authored spawn facing east down the boulevard. */
function freshGame(seed = 42) {
  const state = createGame({ seed });
  beginPlay(state);
  state.player.x = state.map.spawn.x + 0.5;
  state.player.y = state.map.spawn.y + 0.5;
  state.player.dir = 0; // +x
  return state;
}

/** Teleport an enemy onto the player's crosshair with 1 hp so one shot kills. */
function stageVictims(state: ReturnType<typeof createGame>): void {
  for (const e of state.enemies) {
    e.hp = 1;
    e.x = state.player.x + 5;
    e.y = state.player.y;
    e.state = "idle";
    e.flash = 0;
  }
}

describe("objective pipeline", () => {
  it("starts in menu and enters play mode on demand", () => {
    const state = createGame({ seed: 1 });
    expect(state.mode).toBe("menu");
    beginPlay(state);
    expect(state.mode).toBe("playing");
  });

  it("pauses and resumes only from the matching mode, with events", () => {
    const state = createGame({ seed: 1 });
    expect(pauseGame(state)).toBe(false); // cannot pause a menu
    beginPlay(state);
    state.events.length = 0;
    expect(pauseGame(state)).toBe(true);
    expect(state.mode).toBe("paused");
    expect(state.events).toContain("Paused.");
    expect(pauseGame(state)).toBe(false);
    expect(resumeGame(state)).toBe(true);
    expect(state.mode).toBe("playing");
    expect(state.events[state.events.length - 1]).toBe("Resumed.");
    expect(resumeGame(state)).toBe(false);
  });

  it("a zero-HP live state ends in defeat instead of walking dead", () => {
    const state = freshGame();
    state.player.hp = 0;
    stepGame(state, IDLE, STEP);
    expect(state.mode).toBe("defeat");
    expect(state.events.some((t) => t.includes("wardens got you"))).toBe(true);
  });

  it("fires kill the staged target and bump the kill count", () => {
    const state = freshGame();
    stageVictims(state);
    stepGame(state, FIRE, STEP);
    expect(state.kills).toBe(1);
    expect(state.enemies[0].state).toBe("dead");
    expect(state.enemies[0].hp).toBe(0);
    expect(state.exitOpen).toBe(false);
    expect(state.fire.cooldown).toBeGreaterThan(0);
    expect(state.fire.muzzle).toBeGreaterThan(0);
    expect(state.fire.hitmarker).toBeGreaterThan(0);
  });

  it("does not exceed the cooldown while the trigger is held", () => {
    const state = freshGame();
    stageVictims(state);
    // First shot kills enemy 0; next shots need the 0.38s cooldown back.
    stepGame(state, FIRE, STEP);
    const afterFirst = state.kills;
    for (let i = 0; i < 10; i++) stepGame(state, FIRE, STEP);
    expect(state.kills).toBe(afterFirst);
    expect(state.fire.cooldown).toBeGreaterThan(0);
  });

  it("the exit stays sealed until every enemy is dead", () => {
    const state = freshGame();
    stageVictims(state);
    // Kill all but one; walk onto the exit tile; check no victory.
    for (let i = 0; i < state.enemies.length - 1; i++) {
      state.fire.cooldown = 0;
      state.enemies.forEach((e, j) => {
        if (j === i) {
          e.hp = 1;
          e.x = state.player.x + 5;
          e.y = state.player.y;
        }
      });
      const before = state.kills;
      stepGame(state, FIRE, STEP);
      expect(state.kills).toBe(before + 1);
    }
    state.player.x = state.map.exit.x + 0.5;
    state.player.y = state.map.exit.y + 0.5;
    state.hintCooldown = 0;
    stepGame(state, IDLE, STEP);
    expect(state.exitOpen).toBe(false);
    expect(state.mode).not.toBe("victory");
    expect(state.events.some((t) => t.includes("sealed"))).toBe(true);
  });

  it("victory fires once all are dead and the player reaches the exit", () => {
    const state = freshGame();
    stageVictims(state);
    const total = state.enemies.length;
    for (let i = 0; i < total; i++) {
      state.fire.cooldown = 0;
      const e = state.enemies[i];
      e.hp = 1;
      e.x = state.player.x + 5;
      e.y = state.player.y;
      stepGame(state, FIRE, STEP);
    }
    expect(state.kills).toBe(total);
    expect(state.exitOpen).toBe(true);
    expect(state.events.some((t) => t.startsWith("EXIT UNLOCKED"))).toBe(true);

    state.player.x = state.map.exit.x + 0.5;
    state.player.y = state.map.exit.y + 0.5;
    stepGame(state, IDLE, STEP);
    expect(state.mode).toBe("victory");
  });

  it("reaching the exit while the last warden lives still teases, not wins", () => {
    const state = freshGame();
    state.player.x = state.map.exit.x + 0.5;
    state.player.y = state.map.exit.y + 0.5;
    state.hintCooldown = 0;
    stepGame(state, IDLE, STEP);
    expect(state.mode).toBe("playing");
  });

  it("defeat triggers when hp is drained", () => {
    const state = freshGame();
    state.player.hp = 1;
    const e = state.enemies[0];
    // Stage one enemy already in attack windup, adjacent with clear LOS.
    e.x = state.player.x + 0.6;
    e.y = state.player.y;
    e.state = "attack";
    e.stateTime = 0;
    const others = state.enemies.slice(1);
    for (const o of others) {
      o.state = "idle";
      o.hp = 1;
      o.wanderTimer = 999; // keep them still
    }
    for (let i = 0; i < 120 && state.mode === "playing"; i++) {
      stepGame(state, IDLE, STEP);
    }
    expect(state.mode).toBe("defeat");
    expect(state.player.hp).toBe(0);
  });

  it("events feed exactly one status message per step", () => {
    const state = freshGame();
    stageVictims(state);
    state.events.length = 0; // drain the "GO!" banner
    stepGame(state, FIRE, STEP);
    expect(state.events.length).toBe(1);
    expect(state.events[0]).toContain("WARDEN DOWN");
  });
});

describe("restart", () => {
  it("resets mode, hp, kills, and enemies to the initial layout", () => {
    const seed = 1234;
    const played = freshGame(seed);
    stageVictims(played);
    stepGame(played, FIRE, STEP);
    played.player.hp = PLAYER_MAX_HP - 2;
    played.mode = "defeat";

    const fresh = resetGame(played);
    expect(fresh.mode).toBe("menu");
    expect(fresh.player.hp).toBe(PLAYER_MAX_HP);
    expect(fresh.player.x).toBe(fresh.map.spawn.x + 0.5);
    expect(fresh.kills).toBe(0);
    expect(fresh.exitOpen).toBe(false);
    for (const e of fresh.enemies) {
      expect(e.hp).toBeGreaterThan(0);
      expect(e.state).toBe("idle");
    }
    // Same seed → identical enemy starting positions.
    const reference = freshGame(seed);
    expect(fresh.enemies.map((e) => [e.id, e.x, e.y, e.hp])).toEqual(
      reference.enemies.map((e) => [e.id, e.x, e.y, e.hp]),
    );
  });

  it("a restarted run is deterministic: same steps produce the same state", () => {
    const play = (seed: number) => {
      const s = freshGame(seed);
      s.enemies.forEach((e) => {
        e.x = s.player.x + 6;
        e.y = s.player.y;
        e.state = "idle";
      });
      for (let i = 0; i < 30; i++) stepGame(s, IDLE, STEP);
      return {
        p: [s.player.x, s.player.y, s.player.hp] as const,
        e: s.enemies.map((e) => [Number(e.x.toFixed(6)), Number(e.y.toFixed(6)), e.state] as const),
      };
    };
    expect(play(77)).toEqual(play(77));
  });
});
