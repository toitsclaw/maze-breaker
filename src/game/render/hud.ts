import {
  HITMARK_TIME,
  PLAYER_MAX_HP,
  RECOIL_TIME,
  VIEW_H,
  VIEW_W,
} from "../constants";
import type { GameState } from "../types";
import { totalEnemies } from "../state";
import { drawMinimap } from "./minimap";

/** First-person pistol, crosshair, bars, messages — all drawn with primitives. */

const textFontSmall = "bold 7px 'Courier New', monospace";
const textFontTiny = "bold 6px 'Courier New', monospace";

export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  reducedMotion: boolean,
): void {
  const { player, fire } = state;

  // --- crosshair ---
  ctx.strokeStyle = "rgba(232,236,244,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(VIEW_W / 2 - 5, VIEW_H / 2 + 0.5);
  ctx.lineTo(VIEW_W / 2 - 2, VIEW_H / 2 + 0.5);
  ctx.moveTo(VIEW_W / 2 + 2, VIEW_H / 2 + 0.5);
  ctx.lineTo(VIEW_W / 2 + 5, VIEW_H / 2 + 0.5);
  ctx.stroke();

  // --- hitmarker ---
  if (fire.hitmarker > 0) {
    const a = fire.hitmarker / HITMARK_TIME;
    ctx.strokeStyle = `rgba(255,207,94,${a.toFixed(2)})`;
    ctx.beginPath();
    const g = 3;
    const r = 4;
    const cx = VIEW_W / 2 + 0.5;
    const cy = VIEW_H / 2 + 0.5;
    // small x around center
    ctx.moveTo(cx - r - g, cy - r - g); ctx.lineTo(cx - g, cy - g);
    ctx.moveTo(cx + g, cy + g); ctx.lineTo(cx + r + g, cy + r + g);
    ctx.moveTo(cx + r + g, cy - r - g); ctx.lineTo(cx + g, cy - g);
    ctx.moveTo(cx - g, cy + g); ctx.lineTo(cx - r - g, cy + r + g);
    ctx.stroke();
    if (fire.hitmarkerKill) {
      ctx.font = textFontSmall;
      ctx.fillStyle = `rgba(255,207,94,${a.toFixed(2)})`;
      ctx.fillText("KILL", VIEW_W / 2 - 7, VIEW_H / 2 - 10);
    }
  }

  // --- damage vignette (static shape, fades by alpha; safe with reduced motion) ---
  if (player.hurt > 0) {
    ctx.strokeStyle = `rgba(255,60,60,${(player.hurt * 0.55).toFixed(2)})`;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, VIEW_W - 6, VIEW_H - 6);
  }

  // --- low-res status bar strip ---
  ctx.fillStyle = "rgba(10,12,17,0.64)";
  ctx.fillRect(0, VIEW_H - 14, VIEW_W, 14);

  // HP bar
  drawBars(ctx, state);

  // --- messages (newest first) ---
  ctx.font = textFontSmall;
  for (let i = 0; i < state.messages.length && i < 2; i++) {
    const m = state.messages[i];
    const alpha = Math.min(1, m.t / 0.6);
    ctx.fillStyle = `rgba(232,236,244,${alpha.toFixed(2)})`;
    ctx.textAlign = "center";
    ctx.fillText(m.text, VIEW_W / 2, 10 + i * 9);
    ctx.textAlign = "left";
  }

  // --- pistol ---
  drawPistol(ctx, state, reducedMotion);

  drawMinimap(ctx, state);
}

function drawBars(ctx: CanvasRenderingContext2D, state: GameState): void {
  const y = VIEW_H - 11;
  // HP
  ctx.font = textFontTiny;
  ctx.fillStyle = "#9aa3b2";
  ctx.fillText("HP", 4, y + 6);
  const barX = 17;
  const barW = 60;
  ctx.strokeStyle = "rgba(232,236,244,0.5)";
  ctx.strokeRect(barX + 0.5, y + 0.5, barW, 6);
  const hpFrac = state.player.hp / PLAYER_MAX_HP;
  const hpW = Math.round((barW - 2) * hpFrac);
  ctx.fillStyle = hpFrac > 0.34 ? "#39d98a" : "#ff5a5a";
  ctx.fillRect(barX + 1, y + 1, hpW, 5);
  ctx.fillStyle = "#e8ecf4";
  ctx.fillText(`${state.player.hp}/${PLAYER_MAX_HP}`, barX + barW + 4, y + 6);

  // Kills
  ctx.fillStyle = "#9aa3b2";
  const killsX = barX + barW + 34;
  ctx.fillText("KILLS", killsX, y + 6);
  ctx.fillStyle = "#ffcf5e";
  ctx.fillText(`${state.kills}/${totalEnemies(state)}`, killsX + 28, y + 6);

  // Objective chip (left of the pistol silhouette)
  ctx.fillStyle = state.exitOpen ? "#39d98a" : "#ffcf5e";
  ctx.fillText(state.exitOpen ? "REACH THE EXIT" : "CLEAR ALL WARDENS", killsX + 74, y + 6);
  ctx.textAlign = "left";
}

/** View-model pistol: barrel from lower-right, recoil kick + muzzle flash. */
function drawPistol(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  reducedMotion: boolean,
): void {
  const { fire, player } = state;
  const bobT = player.bob;
  // Weapon bob is decorative; users who ask for less motion keep the static gun.
  const bobX = reducedMotion ? 0 : Math.sin(bobT) * 1.2;
  const bobY = reducedMotion ? 0 : Math.abs(Math.cos(bobT)) * 1.4;
  const kick = (fire.recoil / RECOIL_TIME) * 5;
  const baseX = VIEW_W - 58 + bobX;
  const baseY = VIEW_H - 40 + bobY - kick;

  // hands/forearm
  ctx.fillStyle = "#c99a6a";
  ctx.fillRect(baseX + 12, baseY + 16, 34, 26);
  ctx.fillStyle = "#16243f";
  ctx.fillRect(baseX + 12, baseY + 16, 34, 5); // sleeve

  // grip
  ctx.fillStyle = "#2b2f36";
  ctx.fillRect(baseX + 8, baseY + 10, 10, 22);
  // receiver
  ctx.fillStyle = "#3a4048";
  ctx.fillRect(baseX + 4, baseY + 2, 26, 12);
  // slide (aiming up-left, slightly angled look via stacked rects)
  ctx.fillStyle = "#565e6a";
  ctx.fillRect(baseX + 2, baseY - 6, 14, 12);
  ctx.fillRect(baseX - 4, baseY - 10, 10, 12);
  // muzzle
  ctx.fillStyle = "#20242a";
  ctx.fillRect(baseX - 10, baseY - 12, 8, 6);
  // sight
  ctx.fillStyle = "#9aa3b2";
  ctx.fillRect(baseX - 2, baseY - 13, 2, 3);

  // muzzle flash
  if (fire.muzzle > 0) {
    const mx = baseX - 12;
    const my = baseY - 10;
    ctx.fillStyle = "rgba(255,214,90,0.95)";
    ctx.beginPath();
    ctx.moveTo(mx - 9, my + 3);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx - 2, my - 7);
    ctx.lineTo(mx + 3, my - 2);
    ctx.lineTo(mx + 9, my - 5);
    ctx.lineTo(mx + 3, my + 2);
    ctx.lineTo(mx + 6, my + 8);
    ctx.lineTo(mx, my + 4);
    ctx.lineTo(mx - 6, my + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(mx, my + 1, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
