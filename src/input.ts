import type { StepInput } from "./game/types";
import { KEY_TURN_SPEED, MOUSE_SENS } from "./game/constants";

/**
 * Keyboard + pointer-lock mouse. The map only *reads* held keys; edge events
 * (start/pause) come through callbacks so overlays can react immediately.
 */

export interface InputHost {
  canvas: HTMLCanvasElement;
  isPlaying: () => boolean;
  onPauseToggle: () => void; // Esc / P key
  onPrimary: () => void; // Enter / Space while an overlay is visible
}

export interface GameInput {
  poll: (dt?: number) => StepInput;
  dispose: () => void;
  isPointerLocked: () => boolean;
  requestLock: () => void;
  /** Drop held fire/yaw without forgetting held movement keys. */
  releaseTriggers: () => void;
}

const HELD_TURN_KEYS_LEFT = new Set(["KeyQ", "ArrowLeft"]);
const HELD_TURN_KEYS_RIGHT = new Set(["KeyE", "ArrowRight"]);

export function createInput(host: InputHost): GameInput {
  const keys = new Set<string>();
  let fireDown = false;
  let yawPending = 0;

  function keyBlocker(code: string): boolean {
    // Keep the page from scrolling while playing.
    return (
      host.isPlaying() &&
      (code === "Space" ||
        code.startsWith("Arrow") ||
        code === "KeyW" ||
        code === "KeyA" ||
        code === "KeyS" ||
        code === "KeyD" ||
        code === "KeyQ" ||
        code === "KeyE" ||
        code === "KeyP")
    );
  }

  function clearHeld(): void {
    keys.clear();
    fireDown = false;
    yawPending = 0;
  }

  function releaseTriggers(): void {
    fireDown = false;
    yawPending = 0;
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    // Leave browser/OS shortcuts alone (Ctrl+W, Cmd+R, Alt+Left, …).
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.repeat) {
      if (keyBlocker(ev.code)) ev.preventDefault();
      return;
    }
    switch (ev.code) {
      case "Escape":
      case "KeyP":
        // Esc also exits pointer lock natively; treat both as a pause toggle.
        host.onPauseToggle();
        if (host.isPlaying()) ev.preventDefault();
        return;
      case "Enter":
        host.onPrimary();
        return;
      case "Space":
        if (!host.isPlaying()) {
          host.onPrimary();
          ev.preventDefault();
          return;
        }
        fireDown = true;
        ev.preventDefault();
        return;
      default:
        break;
    }
    if (keyBlocker(ev.code)) ev.preventDefault();
    keys.add(ev.code);
  };

  const onKeyUp = (ev: KeyboardEvent): void => {
    keys.delete(ev.code);
    if (ev.code === "Space") fireDown = false;
  };

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;
    if (host.isPlaying()) {
      if (document.pointerLockElement !== host.canvas) requestLock(host);
      fireDown = true;
      ev.preventDefault();
    }
  };

  const onMouseUp = (): void => {
    fireDown = false;
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (document.pointerLockElement === host.canvas && host.isPlaying()) {
      yawPending += ev.movementX * MOUSE_SENS;
    }
  };

  const onContext = (ev: Event): void => {
    ev.preventDefault();
  };

  const onBlur = (): void => {
    // Alt-tab with a held key would leave the game walking by itself.
    clearHeld();
  };

  const onVisibility = (): void => {
    if (document.hidden) clearHeld();
  };

  const onPointerLockChange = (): void => {
    // If focus/lock is lost mid-shot, do not resume with a stuck trigger.
    if (document.pointerLockElement !== host.canvas) clearHeld();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);
  host.canvas.addEventListener("mousedown", onMouseDown);
  host.canvas.addEventListener("contextmenu", onContext);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("pointerlockchange", onPointerLockChange);

  return {
    poll(dt = 1 / 60): StepInput {
      let turn = 0;
      if (anyOf(keys, HELD_TURN_KEYS_LEFT)) turn -= 1;
      if (anyOf(keys, HELD_TURN_KEYS_RIGHT)) turn += 1;

      const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
      const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);

      const yaw = yawPending + turn * KEY_TURN_SPEED * dt;
      yawPending = 0;
      return {
        moveX: strafe,
        moveY: forward,
        yawDelta: yaw,
        fire: fireDown,
      };
    },
    dispose(): void {
      clearHeld();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      host.canvas.removeEventListener("mousedown", onMouseDown);
      host.canvas.removeEventListener("contextmenu", onContext);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    },
    isPointerLocked: () => document.pointerLockElement === host.canvas,
    requestLock: () => {
      requestLock(host);
    },
    releaseTriggers,
  };
}

function anyOf(keys: Set<string>, set: Set<string>): boolean {
  for (const k of set) if (keys.has(k)) return true;
  return false;
}

/** Pointer lock can be denied (browser gesture rules); never surface errors. */
function requestLock(host: InputHost): void {
  if (document.pointerLockElement === host.canvas) return;
  try {
    const p = host.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p instanceof Promise) p.catch(() => {});
  } catch {
    // deny — keyboard-only play keeps working
  }
}
