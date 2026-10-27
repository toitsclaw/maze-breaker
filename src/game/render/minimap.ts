import type { GameState } from "../types";

/** Small tile minimap drawn around the player, top-right corner. */

const CELL = 4; // px per map cell
const RADIUS = 7; // cells shown around the player

export function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { map, player } = state;
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  const size = (RADIUS * 2 + 1) * CELL;
  const ox = ctx.canvas.width - size - 5;
  const oy = 5;

  ctx.fillStyle = "rgba(8,10,14,0.62)";
  ctx.fillRect(ox - 2, oy - 2, size + 4, size + 4);

  // Keep enemy dots and the facing wedge inside the tactical panel.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, size, size);
  ctx.clip();

  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const x = px + dx;
      const y = py + dy;
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const tile = map.cells[y * map.w + x];
      if (tile === 1) continue; // wall = background darkness
      const sx = ox + (dx + RADIUS) * CELL;
      const sy = oy + (dy + RADIUS) * CELL;
      if (tile === 2) {
        ctx.fillStyle = state.exitOpen ? "#39d98a" : "#57606f";
      } else {
        ctx.fillStyle = "#2a3040";
      }
      ctx.fillRect(sx, sy, CELL, CELL);
    }
  }

  // Enemies as red dots.
  ctx.fillStyle = "#ff5a5a";
  for (const e of state.enemies) {
    if (e.state === "dead") continue;
    const dx = e.x - px;
    const dy = e.y - py;
    if (Math.abs(dx) > RADIUS + 0.5 || Math.abs(dy) > RADIUS + 0.5) continue;
    const sx = ox + (dx + RADIUS + 0.5) * CELL;
    const sy = oy + (dy + RADIUS + 0.5) * CELL;
    ctx.fillRect(sx - 1, sy - 1, 3, 3);
  }

  // Player as a facing wedge.
  const cx = ox + (RADIUS + (player.x - px)) * CELL;
  const cy = oy + (RADIUS + (player.y - py)) * CELL;
  const ndx = Math.cos(player.dir);
  const ndy = Math.sin(player.dir);
  ctx.fillStyle = "#e8ecf4";
  ctx.beginPath();
  ctx.moveTo(cx + ndx * 4, cy + ndy * 4);
  ctx.lineTo(cx - ndx * 2 - ndy * 2.4, cy - ndy * 2 + ndx * 2.4);
  ctx.lineTo(cx - ndx * 2 + ndy * 2.4, cy - ndy * 2 - ndx * 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(8,10,14,0.6)";
  ctx.strokeRect(ox - 2.5, oy - 2.5, size + 5, size + 5);
}
