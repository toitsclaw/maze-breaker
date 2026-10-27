/** Central tuning knobs. Everything gameplay-affecting lives here. */

// Fixed internal render resolution (scaled up with CSS, pixelated).
export const VIEW_W = 384;
export const VIEW_H = 216;
export const FOV_PLANE = 0.66; // tan(~33°) → ~66° horizontal FOV

// Simulation
export const STEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.25;

// Player
export const PLAYER_RADIUS = 0.22;
export const PLAYER_SPEED = 2.35;
export const PLAYER_MAX_HP = 6;
export const KEY_TURN_SPEED = 2.9; // rad/s for Q/E and arrow keys
export const MOUSE_SENS = 0.0022; // rad per px of pointer-lock movement

// Pistol
export const PISTOL_DAMAGE = 1;
export const PISTOL_RANGE = 22;
export const PISTOL_COOLDOWN = 0.38;
export const MUZZLE_TIME = 0.1;
export const RECOIL_TIME = 0.14;
export const HITMARK_TIME = 0.28;

// Feedback timers
export const FLASH_TIME = 0.12; // enemy hit flash (white sprite variant)
export const HURT_TIME = 0.55; // player damage vignette
export const MESSAGE_TIME = 3.2; // HUD message ticker lifetime

// Enemies
export const ENEMY_RADIUS = 0.26;
export const ENEMY_HP = 2;
export const ENEMY_CHASE_SPEED = 1.62;
export const ENEMY_WANDER_SPEED = 0.7;
export const ENEMY_SIGHT_DIST = 8.5; // line-of-sight aggro range
export const ENEMY_NOISE_DIST = 6.5; // gunfire aggro range (through walls)
export const ENEMY_ATTACK_RANGE = 0.95;
export const ENEMY_ATTACK_WINDUP = 0.38;
export const ENEMY_ATTACK_COOLDOWN = 1.15;
export const ENEMY_ATTACK_DAMAGE = 1;
export const ENEMY_MIN_GAP = 0.55; // closest an enemy keeps to the player
export const WANDER_INTERVAL = 2.2; // seconds between idle wander choices
