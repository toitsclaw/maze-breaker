/**
 * Prerendered programmatic billboard sprites (no image assets).
 * Drawn once into small offscreen canvases, then blitted per-column with
 * depth-buffer occlusion. Enemy frames exist per state plus white flash
 * variants; the exit beacon has a locked frame and two open pulse frames.
 */

export type SpriteKey = "idle" | "chase" | "attack" | "dead";

export interface SpriteSheet {
  enemy: Record<SpriteKey, HTMLCanvasElement>;
  flash: Record<SpriteKey, HTMLCanvasElement>;
  exitLocked: HTMLCanvasElement;
  exitOpenA: HTMLCanvasElement;
  exitOpenB: HTMLCanvasElement;
}

const EW = 48; // enemy sprite width  (px in source canvas)
const EH = 64; // enemy sprite height
const BW = 24; // exit beacon width
const BH = 64;

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("2D context unavailable");
  return { c, g };
}

function fill(g: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function bodyColors(state: SpriteKey): { torso: string; limb: string; head: string; eye: string } {
  switch (state) {
    case "chase":
      return { torso: "#7d4a3f", limb: "#5e372f", head: "#c08a5f", eye: "#ff4136" };
    case "attack":
      return { torso: "#8a4a33", limb: "#63352a", head: "#c98d55", eye: "#ffb03a" };
    case "dead":
      return { torso: "#46302a", limb: "#352420", head: "#6b5340", eye: "#3c3c46" };
    case "idle":
      return { torso: "#6b5a48", limb: "#524539", head: "#b0895c", eye: "#ffcf5e" };
  }
}

function drawEnemy(g: CanvasRenderingContext2D, state: SpriteKey): void {
  const col = bodyColors(state);
  g.save();
  g.translate(EW / 2, EH);
  // Ground shadow
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(0, -2, 17, 4, 0, 0, Math.PI * 2);
  g.fill();

  if (state === "dead") {
    // collapsed husk
    fill(g, col.torso, -16, -12, 32, 12);
    fill(g, col.torso, -12, -16, 12, 6);
    // X eyes on the slumped head
    g.strokeStyle = col.eye;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(4, -10);
    g.moveTo(4, -14);
    g.lineTo(0, -10);
    g.stroke();
    g.restore();
    return;
  }

  const armsUp = state === "attack";
  const bob = state === "attack" ? 1 : 0;
  // legs
  fill(g, col.limb, -8, -22 + bob, 6, 22);
  fill(g, col.limb, 2, -22 + bob, 6, 22);
  // torso
  fill(g, col.torso, -12, -42 + bob, 24, 22);
  // arms: raised when attacking
  if (armsUp) {
    fill(g, col.limb, -18, -52 + bob, 6, 14);
    fill(g, col.limb, 12, -52 + bob, 6, 14);
    fill(g, col.limb, -18, -54 + bob, 6, 6);
    fill(g, col.limb, 12, -54 + bob, 6, 6);
  } else {
    fill(g, col.limb, -16, -40 + bob, 5, 18);
    fill(g, col.limb, 11, -40 + bob, 5, 18);
  }
  // head
  g.fillStyle = col.head;
  g.beginPath();
  g.arc(0, -50 + bob, 8, 0, Math.PI * 2);
  g.fill();
  // eyes
  g.fillStyle = col.eye;
  const eyeW = state === "idle" ? 2 : 3;
  fill(g, col.eye, -5, -52 + bob, eyeW, 3);
  fill(g, col.eye, 5 - eyeW, -52 + bob, eyeW, 3);
  if (state === "attack") {
    // gnash
    fill(g, "#2a1c18", -3, -47 + bob, 6, 2);
  }
  g.restore();
}

function tintWhite(c: HTMLCanvasElement): HTMLCanvasElement {
  const { c: out, g } = makeCanvas(c.width, c.height);
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(0, 0, c.width, c.height);
  return out;
}

function drawExit(g: CanvasRenderingContext2D, locked: boolean, bright: number): void {
  const base = locked ? [96, 104, 120] : [57, 217, 138];
  const [r, gr, b] = base.map((v) => Math.min(255, Math.round(v * bright)));
  g.clearRect(0, 0, BW, BH);
  // pillar of light
  g.fillStyle = `rgba(${r},${gr},${b},0.28)`;
  g.fillRect(2, 6, BW - 4, BH - 8);
  g.fillStyle = `rgb(${r},${gr},${b})`;
  g.fillRect(BW / 2 - 5, 8, 10, BH - 12);
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(BW / 2 - 5, 8, 10, 3);
  // padlock icon (closed = sealed, open shackle = go)
  const ly = 22;
  g.fillStyle = locked ? "#2c3140" : "#0e2e20";
  g.fillRect(BW / 2 - 5, ly, 10, 9);
  g.strokeStyle = locked ? "#d95a5a" : "#39d98a";
  g.lineWidth = 2;
  g.beginPath();
  if (locked) {
    g.arc(BW / 2, ly, 4, Math.PI, 0);
  } else {
    g.arc(BW / 2, ly + 3, 4, Math.PI, Math.PI * 1.85);
  }
  g.stroke();
}

export function buildSprites(): SpriteSheet {
  const enemy = {} as Record<SpriteKey, HTMLCanvasElement>;
  const flash = {} as Record<SpriteKey, HTMLCanvasElement>;
  for (const key of ["idle", "chase", "attack", "dead"] as const) {
    const { c, g } = makeCanvas(EW, EH);
    drawEnemy(g, key);
    enemy[key] = c;
    flash[key] = tintWhite(c);
  }
  const lockA = makeCanvas(BW, BH);
  drawExit(lockA.g, true, 1);
  const openA = makeCanvas(BW, BH);
  drawExit(openA.g, false, 1);
  const openB = makeCanvas(BW, BH);
  drawExit(openB.g, false, 1.35);
  return { enemy, flash, exitLocked: lockA.c, exitOpenA: openA.c, exitOpenB: openB.c };
}
