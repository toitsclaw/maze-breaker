/** Shared shapes. Pure data only — no DOM, no runtime deps. */

export type TileType = 0 | 1 | 2; // 0 floor, 1 wall, 2 exit floor (walkable marker)

export interface Vec {
  x: number;
  y: number;
}

export interface MapData {
  w: number;
  h: number;
  cells: Uint8Array; // row-major, [y * w + x]
  spawn: Vec; // player spawn (cell coords, floor tile)
  exit: Vec; // exit beacon (cell coords, floor tile)
  enemySpawns: Vec[];
}

export type EnemyState = "idle" | "chase" | "attack" | "dead";

export interface Enemy {
  id: number;
  x: number;
  y: number;
  radius: number;
  hp: number;
  state: EnemyState;
  stateTime: number; // seconds in current state
  flash: number; // hit-flash timer
  cooldown: number; // attack cooldown (ticks in chase)
  wanderDir: Vec | null; // idle wander heading
  wanderTimer: number;
}

export interface Player {
  x: number;
  y: number;
  dir: number; // facing angle, radians; 0 = +x (east)
  hp: number;
  hurt: number; // damage vignette timer
  bob: number; // walk-cycle phase
}

export interface FireState {
  cooldown: number;
  muzzle: number;
  recoil: number;
  hitmarker: number;
  hitmarkerKill: boolean;
}

export interface StepInput {
  moveX: number; // strafe, [-1, 1]
  moveY: number; // forward, [-1, 1]
  yawDelta: number; // radians applied this step
  fire: boolean; // held
}

export type GameMode = "menu" | "playing" | "paused" | "victory" | "defeat";

export interface Message {
  text: string;
  t: number; // remaining lifetime
}

export interface GameState {
  mode: GameMode;
  map: MapData;
  player: Player;
  enemies: Enemy[];
  fire: FireState;
  kills: number;
  exitOpen: boolean;
  time: number;
  seed: number;
  rng: () => number;
  messages: Message[]; // newest first
  events: string[]; // consumed once per frame by the UI layer (aria-live)
  hintCooldown: number; // throttle for "exit is sealed" reminders
}
