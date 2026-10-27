import { FOV_PLANE, VIEW_H, VIEW_W } from "../constants";
import type { GameState } from "../types";
import { castRay } from "../raycast";
import type { SpriteSheet } from "./sprites";
import { drawHud } from "./hud";

const SHADES = 16;
const FOG = 0.135; // higher = darker distance falloff

type Palette = string[][]; // [light?][side] -> array of SHADES colors, far → dark

function makeShades(r: number, g: number, b: number, boost: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < SHADES; i++) {
    const t = i / (SHADES - 1); // 0 near … 1 far
    const k = Math.min(1, (1 - t * 0.88) * boost);
    out.push(`rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`);
  }
  return out;
}

function buildPalette(r: number, g: number, b: number, sideDim: number, boost = 1): Palette {
  const s0 = makeShades(r, g, b, boost);
  const s1 = makeShades(r * sideDim, g * sideDim, b * sideDim, boost);
  return [s0, s1];
}

// Palettes are built lazily on first draw so the module also works in node tests.
let palNormal: Palette | null = null;
let palLit: Palette | null = null;
function palettes(): [Palette, Palette] {
  if (!palNormal) {
    palNormal = buildPalette(126, 136, 156, 0.68, 1);
    palLit = buildPalette(126, 136, 156, 0.68, 1.45);
  }
  return [palNormal, palLit as Palette];
}

export interface DrawView {
  (state: GameState, sprites: SpriteSheet, reducedMotion: boolean): void;
}

export function createViewRenderer(canvas: HTMLCanvasElement): DrawView {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D unavailable");
  const depth = new Float32Array(VIEW_W);
  return (state, sprites, reducedMotion) =>
    renderFrame(ctx, depth, state, sprites, reducedMotion);
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  depth: Float32Array,
  state: GameState,
  sprites: SpriteSheet,
  reducedMotion: boolean,
): void {
  ctx.imageSmoothingEnabled = false;
  const { player, map, fire } = state;
  const lit = fire.muzzle > 0;
  const [normal, litPal] = palettes();
  const pal = lit ? litPal : normal;

  // Flat-shaded ceiling / floor.
  const mid = VIEW_H >> 1;
  ctx.fillStyle = lit ? "#33302c" : "#26221e";
  ctx.fillRect(0, mid, VIEW_W, VIEW_H - mid);
  ctx.fillStyle = lit ? "#262936" : "#171a23";
  ctx.fillRect(0, 0, VIEW_W, mid);

  const dirX = Math.cos(player.dir);
  const dirY = Math.sin(player.dir);
  const planeX = -dirY * FOV_PLANE;
  const planeY = dirX * FOV_PLANE;

  // Walls: one DDA ray per column + flat shade + per-column depth buffer.
  for (let x = 0; x < VIEW_W; x++) {
    const camX = (2 * x) / VIEW_W - 1;
    const rdX = dirX + planeX * camX;
    const rdY = dirY + planeY * camX;
    const hit = castRay(map, player.x, player.y, rdX, rdY, 64);
    if (!hit) {
      depth[x] = 1e6; // open sky (cannot happen with a bounded map)
      continue;
    }
    const perp = Math.max(hit.dist, 0.02);
    depth[x] = perp;
    const lineH = VIEW_H / perp;
    const top = (VIEW_H - lineH) / 2;
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(VIEW_H, Math.ceil(top + lineH));
    let fade = 1 / (1 + perp * FOG);
    if (lit) fade = Math.min(1, fade * 1.45);
    let idx = ((1 - fade) * SHADES) | 0;
    if (idx > SHADES - 1) idx = SHADES - 1;
    ctx.fillStyle = pal[hit.side][idx];
    ctx.fillRect(x, y0, 1, y1 - y0);
  }

  drawBillboards(ctx, depth, state, sprites, dirX, dirY, planeX, planeY, reducedMotion);
  drawHud(ctx, state, reducedMotion);
}

interface Billboard {
  x: number;
  y: number;
  img: HTMLCanvasElement;
  height: number; // world-space height factor (1 = full wall height)
  depth: number; // perpendicular distance along the camera axis
}

function drawBillboards(
  ctx: CanvasRenderingContext2D,
  depth: Float32Array,
  state: GameState,
  sprites: SpriteSheet,
  dirX: number,
  dirY: number,
  planeX: number,
  planeY: number,
  reducedMotion: boolean,
): void {
  const list: Billboard[] = [];
  const player = state.player;

  const add = (x: number, y: number, img: HTMLCanvasElement, height: number): void => {
    list.push({
      x,
      y,
      img,
      height,
      depth: (x - player.x) * dirX + (y - player.y) * dirY,
    });
  };

  for (const e of state.enemies) {
    if (e.state === "dead") {
      add(e.x, e.y, e.flash > 0 ? sprites.flash.dead : sprites.enemy.dead, 0.32);
    } else {
      const sheet = e.flash > 0 ? sprites.flash : sprites.enemy;
      add(e.x, e.y, sheet[e.state], 0.84);
    }
  }

  const exitImg = !state.exitOpen
    ? sprites.exitLocked
    : reducedMotion
      ? sprites.exitOpenA
      : (state.time % 0.8) < 0.4
        ? sprites.exitOpenA
        : sprites.exitOpenB;
  add(state.map.exit.x + 0.5, state.map.exit.y + 0.5, exitImg, 1.0);

  // Sort far → near so near sprites overdraw (also keeps occlusion cheap).
  list.sort((a, b) => b.depth - a.depth);

  const planeLen2 = planeX * planeX + planeY * planeY;
  for (const item of list) {
    const itemDepth = item.depth;
    if (itemDepth < 0.12) continue; // behind camera / on top of lens
    const rx = item.x - player.x;
    const ry = item.y - player.y;
    // Lateral param t ∈ [-1, 1] of the column ray passing through the sprite.
    const planeDot = planeX * rx + planeY * ry;
    const t = planeDot / (planeLen2 * itemDepth);
    if (t < -1.6 || t > 1.6) continue;
    const centerPx = ((t + 1) / 2) * VIEW_W;
    const wallH = VIEW_H / itemDepth;
    const spriteH = item.height * wallH;
    const srcW = item.img.width;
    const srcH = item.img.height;
    const spriteW = spriteH * (srcW / srcH);
    const left = centerPx - spriteW / 2;
    const bottom = VIEW_H / 2 + wallH / 2;
    const topY = bottom - spriteH;

    const col0 = Math.max(0, Math.floor(left));
    const col1 = Math.min(VIEW_W - 1, Math.ceil(left + spriteW));
    drawSpriteColumns(ctx, item.img, left, spriteW, topY, spriteH, itemDepth, depth, col0, col1);
  }
}

/**
 * Blit only the visible columns of a billboard. Contiguous visible columns are
 * batched into one drawImage, which keeps close-range sprites cheap while
 * retaining true per-column wall occlusion.
 */
function drawSpriteColumns(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  left: number,
  spriteW: number,
  topY: number,
  spriteH: number,
  itemDepth: number,
  depth: Float32Array,
  col0: number,
  col1: number,
): void {
  const srcW = img.width;
  const srcH = img.height;

  const blit = (startX: number, endX: number): void => {
    const u0 = Math.min(srcW - 1, Math.max(0, Math.floor(((startX + 0.5 - left) / spriteW) * srcW)));
    const u1 = Math.min(srcW - 1, Math.max(0, Math.floor(((endX + 0.5 - left) / spriteW) * srcW)));
    const sw = Math.max(1, u1 - u0 + 1);
    ctx.drawImage(img, u0, 0, sw, srcH, startX, topY, endX - startX + 1, spriteH);
  };

  let runStart = -1;
  for (let x = col0; x <= col1 + 1; x++) {
    const visible = x <= col1 && itemDepth < depth[x];
    if (visible) {
      if (runStart < 0) runStart = x;
    } else if (runStart >= 0) {
      blit(runStart, x - 1);
      runStart = -1;
    }
  }
}
