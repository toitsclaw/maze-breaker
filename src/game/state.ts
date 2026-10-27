import {
  FLASH_TIME,
  HITMARK_TIME,
  MESSAGE_TIME,
  MUZZLE_TIME,
  PISTOL_COOLDOWN,
  PISTOL_DAMAGE,
  PISTOL_RANGE,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RECOIL_TIME,
  ENEMY_RADIUS,
  ENEMY_HP,
} from "./constants";
import { MAZE_ROWS, parseLevel } from "./level";
import { mulberry32 } from "./rng";
import type {
  Enemy,
  GameState,
  MapData,
  Message,
  StepInput,
} from "./types";
import { damagePlayer, separateEnemies, updateEnemy, wakeByNoise } from "./enemy";
import { hitscan, applyDamage } from "./combat";
import { moveCircle } from "./collision";

export type { GameMode } from "./types";
export type { StepInput } from "./types";

function say(state: GameState, text: string): void {
  const msg: Message = { text, t: MESSAGE_TIME };
  state.messages.unshift(msg);
  if (state.messages.length > 3) state.messages.length = 3;
  state.events.push(text);
}

function makeEnemies(map: MapData): Enemy[] {
  return map.enemySpawns.map((s, i) => ({
    id: i,
    x: s.x + 0.5,
    y: s.y + 0.5,
    radius: ENEMY_RADIUS,
    hp: ENEMY_HP,
    state: "idle",
    stateTime: 0,
    flash: 0,
    cooldown: 0,
    wanderDir: null,
    wanderTimer: (i * 0.7 + 0.9) % (2.2 + 0.7), // staggered, deterministic
  }));
}

/** Build a fresh game state from the authored maze and a seed. */
export function createGame(opts?: {
  rows?: readonly string[];
  seed?: number;
}): GameState {
  const map = parseLevel(opts?.rows ?? MAZE_ROWS);
  const seed = opts?.seed ?? ((Date.now() & 0xffffffff) >>> 0);
  const rng = mulberry32(seed);
  return {
    mode: "menu",
    map,
    player: {
      x: map.spawn.x + 0.5,
      y: map.spawn.y + 0.5,
      dir: 0,
      hp: PLAYER_MAX_HP,
      hurt: 0,
      bob: 0,
    },
    enemies: makeEnemies(map),
    fire: {
      cooldown: 0,
      muzzle: 0,
      recoil: 0,
      hitmarker: 0,
      hitmarkerKill: false,
    },
    kills: 0,
    exitOpen: false,
    time: 0,
    seed,
    rng,
    messages: [],
    events: [],
    hintCooldown: 0,
  };
}

/** Restart without a page reload: same layout + seed, everything freshly built. */
export function resetGame(state: GameState): GameState {
  return createGame({ rows: MAZE_ROWS, seed: state.seed });
}

/** Transition from menu / paused / after-game into live play. */
export function beginPlay(state: GameState): void {
  state.mode = "playing";
  say(state, "GO! Clear every warden, then reach the exit beacon.");
}

/** Pause a live run. Returns true when the mode actually changed. */
export function pauseGame(state: GameState): boolean {
  if (state.mode !== "playing") return false;
  state.mode = "paused";
  state.events.push("Paused.");
  return true;
}

/** Resume a paused run. Returns true when the mode actually changed. */
export function resumeGame(state: GameState): boolean {
  if (state.mode !== "paused") return false;
  state.mode = "playing";
  state.events.push("Resumed.");
  return true;
}

/**
 * One fixed-step simulation tick. Deterministic given (state, input, dt)
 * and the seeded rng already stored on state.
 */
export function stepGame(state: GameState, input: StepInput, dt: number): void {
  if (state.mode !== "playing") return;
  const player = state.player;
  const map = state.map;

  // Defensive: a state restored at 0 HP should end the run, not walk around dead.
  if (player.hp <= 0) {
    state.mode = "defeat";
    say(state, "The wardens got you.");
    return;
  }

  // --- Player: aim -----------------------------------------------------------
  player.dir += input.yawDelta;
  player.dir = ((player.dir + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  // Player: move (strafe/forward composed into world velocity, then collide)
  const dirX = Math.cos(player.dir);
  const dirY = Math.sin(player.dir);
  const moveMag = Math.hypot(input.moveX, input.moveY);
  if (moveMag > 1e-6) {
    const s = Math.min(1, moveMag);
    const vx = (dirX * input.moveY + -dirY * input.moveX) / moveMag * s;
    const vy = (dirY * input.moveY + dirX * input.moveX) / moveMag * s;
    const m = moveCircle(map, player.x, player.y, PLAYER_RADIUS, vx * PLAYER_SPEED * dt, vy * PLAYER_SPEED * dt);
    if (m.moved) player.bob += dt * 9;
    player.x = m.x;
    player.y = m.y;
  }

  // Player: fire --------------------------------------------------------------
  let noise = false;
  const f = state.fire;
  if (input.fire && f.cooldown <= 0) {
    f.cooldown = PISTOL_COOLDOWN;
    f.muzzle = MUZZLE_TIME;
    f.recoil = RECOIL_TIME;
    noise = true;
    const ux = dirX;
    const uy = dirY;
    const result = hitscan(map, state.enemies, player.x, player.y, ux, uy, PISTOL_RANGE);
    if (result.targetIndex >= 0) {
      const enemy = state.enemies[result.targetIndex];
      const kill = applyDamage(enemy, PISTOL_DAMAGE);
      enemy.flash = FLASH_TIME;
      f.hitmarker = HITMARK_TIME;
      f.hitmarkerKill = kill;
      if (kill) {
        enemy.state = "dead";
        enemy.stateTime = 0;
        enemy.wanderDir = null;
        state.kills += 1;
        const total = state.enemies.length;
        if (state.kills >= total) {
          state.exitOpen = true;
          say(state, `EXIT UNLOCKED — ${state.kills}/${total} wardens down. Escape!`);
        } else {
          say(state, `WARDEN DOWN ${state.kills}/${total}`);
        }
      }
    }
  }

  // Enemies --------------------------------------------------------------------
  wakeByNoise(state.enemies, player, noise);
  const ctx = {
    map,
    player,
    playerAlive: player.hp > 0,
    dt,
    rng: state.rng,
    onPlayerHit: (damage: number) => damagePlayer(state, damage),
  };
  for (const e of state.enemies) {
    updateEnemy(e, ctx);
    if (state.player.hp <= 0) {
      state.mode = "defeat";
      say(state, "The wardens got you.");
      break;
    }
    if (state.mode !== "playing") break; // safety; keeps world-stops single-step
  }
  if (state.mode !== "playing") {
    tickFeedback(state, dt);
    return;
  }

  separateEnemies(state.enemies, map);

  // Objectives: reaching the sealed exit teases; the open exit wins. ------------
  const ifx = Math.floor(player.x);
  const ify = Math.floor(player.y);
  const onExit = ifx === map.exit.x && ify === map.exit.y;
  if (onExit) {
    if (state.exitOpen) {
      state.mode = "victory";
      say(state, "YOU ESCAPED THE MAZE!");
      tickFeedback(state, dt);
      return;
    }
    if (state.hintCooldown <= 0) {
      state.hintCooldown = 2.5;
      say(state, "The exit is sealed. Every warden must fall first.");
    }
  }

  tickFeedback(state, dt);
}

function tickFeedback(state: GameState, dt: number): void {
  const f = state.fire;
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.muzzle = Math.max(0, f.muzzle - dt);
  f.recoil = Math.max(0, f.recoil - dt);
  f.hitmarker = Math.max(0, f.hitmarker - dt);
  state.player.hurt = Math.max(0, state.player.hurt - dt);
  state.hintCooldown = Math.max(0, state.hintCooldown - dt);
  for (const m of state.messages) m.t -= dt;
  while (state.messages.length > 0 && state.messages[state.messages.length - 1].t <= 0) {
    state.messages.pop();
  }
  state.time += dt;
}

/** Convenience for HUD/overlay formatting. */
export function totalEnemies(state: GameState): number {
  return state.enemies.length;
}
