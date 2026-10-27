import "./style.css";
import { MAX_FRAME_DELTA, STEP } from "./game/constants";
import {
  beginPlay,
  createGame,
  pauseGame,
  resetGame,
  resumeGame,
  stepGame,
} from "./game/state";
import { createViewRenderer } from "./game/render/renderer";
import { buildSprites } from "./game/render/sprites";
import { createInput } from "./input";
import { createAnnouncer, formatEvents } from "./ui/announce";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const overlayTitle = document.getElementById("overlay-title") as HTMLElement;
const overlayText = document.getElementById("overlay-text") as HTMLElement;
const overlayButton = document.getElementById("overlay-button") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;

let state = createGame();
const draw = createViewRenderer(canvas);
const sprites = buildSprites();

const reducedMq = matchMedia("(prefers-reduced-motion: reduce)");

// Seed can be pinned via ?seed=42 for deterministic runs.
const seedParam = new URLSearchParams(location.search).get("seed");
if (seedParam !== null) {
  const parsed = Number.parseInt(seedParam, 10);
  if (Number.isFinite(parsed)) state = createGame({ seed: parsed >>> 0 });
}

interface OverlayCopy {
  title: string;
  text: string;
  button: string;
}
const COPY: Record<string, OverlayCopy> = {
  menu: {
    title: "MAZE BREAKER",
    text: "A sealed maze, wardens in the dark, one pistol. Clear every warden to unseal the exit, then walk to the green beacon.",
    button: "Start",
  },
  paused: {
    title: "PAUSED",
    text: "Take a breath. The wardens will wait.",
    button: "Resume",
  },
  victory: {
    title: "YOU ESCAPED",
    text: "",
    button: "Play again",
  },
  defeat: {
    title: "GAME OVER",
    text: "The wardens got you. Same maze, same seed — go again whenever you like.",
    button: "Try again",
  },
};

let overlayShownFor: string | null = null;
let lastMode = state.mode;
let ignoreResumeUntil = 0;

function releasePointerLock(): void {
  if (document.pointerLockElement !== canvas) return;
  try {
    document.exitPointerLock();
  } catch {
    // Older browsers can throw; the overlay remains keyboard-operable.
  }
}

function syncOverlay(): void {
  const mode = state.mode;
  if (mode === "playing") {
    if (!overlay.hidden) overlay.hidden = true;
    overlayShownFor = null;
    // Hidden elements cannot keep focus: put it on the canvas so keyboard
    // users stay inside the game instead of bouncing to <body>.
    if (lastMode !== "playing") canvas.focus({ preventScroll: true });
    lastMode = mode;
    return;
  }

  // The overlay must be clickable: never keep the cursor captured behind it.
  releasePointerLock();

  if (overlayShownFor === mode) {
    lastMode = mode;
    return;
  }
  const copy = COPY[mode] ?? COPY.menu;
  overlayTitle.textContent = copy.title;
  overlayText.textContent = mode === "victory" ? victoryText() : copy.text;
  overlayButton.textContent = copy.button;
  overlay.hidden = false;
  overlayShownFor = mode;
  lastMode = mode;
  // Allow focus() to scroll the overlay itself in very short viewports.
  overlayButton.focus();
}

function victoryText(): string {
  return `All ${state.enemies.length} wardens down in ${Math.round(state.time)}s with ${state.player.hp} HP left. Go again?`;
}

const announce = createAnnouncer((text) => {
  statusEl.textContent = text;
});

function drainEvents(): void {
  if (state.events.length === 0) return;
  // Batch a tick's events instead of silently dropping all but the last one.
  const text = formatEvents(state.events);
  state.events.length = 0;
  announce(text);
}

function startOrResume(): void {
  if (state.mode === "playing") return;
  if (state.mode === "paused") {
    resumeGame(state);
  } else {
    // Menu / victory / defeat all rebuild the same seeded run in place.
    state = resetGame(state);
    beginPlay(state);
  }
  syncOverlay();
  input.requestLock();
}

function pauseFromUi(): void {
  if (!pauseGame(state)) return;
  input.releaseTriggers();
  syncOverlay();
}

const input = createInput({
  canvas,
  isPlaying: () => state.mode === "playing",
  onPauseToggle: () => {
    if (state.mode === "playing") {
      pauseFromUi();
      return;
    }
    // Browsers that deliver the Esc keydown *after* the pointer-lock loss
    // event would otherwise pause and immediately resume in one press.
    if (state.mode === "paused" && performance.now() >= ignoreResumeUntil) {
      startOrResume();
    }
  },
  onPrimary: () => {
    if (state.mode !== "playing") startOrResume();
  },
});

function onOverlayClick(): void {
  if (state.mode !== "playing") startOrResume();
}

function onPointerLockChange(): void {
  if (state.mode === "playing" && document.pointerLockElement !== canvas) {
    // Pointer lock was dismissed by the browser (usually Esc): pause once.
    ignoreResumeUntil = performance.now() + 250;
    pauseFromUi();
  }
}

function onVisibilityChange(): void {
  if (document.hidden && state.mode === "playing") pauseFromUi();
}

overlayButton.addEventListener("click", onOverlayClick);
document.addEventListener("pointerlockchange", onPointerLockChange);
document.addEventListener("visibilitychange", onVisibilityChange);

// Main loop: fixed-timestep simulation, draw once per animation frame.
let last = performance.now();
let acc = 0;
let rafId = 0;

function frame(now: number): void {
  const delta = Math.min((now - last) / 1000, MAX_FRAME_DELTA);
  last = now;
  acc += delta;
  while (acc >= STEP) {
    acc -= STEP;
    stepGame(state, input.poll(STEP), STEP);
  }
  draw(state, sprites, reducedMq.matches);
  drainEvents();
  syncOverlay();
  rafId = requestAnimationFrame(frame);
}

syncOverlay();
rafId = requestAnimationFrame(frame);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(rafId);
    input.dispose();
    overlayButton.removeEventListener("click", onOverlayClick);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    releasePointerLock();
  });
}
