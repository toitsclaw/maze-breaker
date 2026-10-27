import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInput, type InputHost } from "../src/input";
import { KEY_TURN_SPEED } from "../src/game/constants";

type Handler = (ev: unknown) => void;

class FakeTarget {
  readonly listeners = new Map<string, Set<Handler>>();

  addEventListener(type: string, handler: Handler): void {
    const set = this.listeners.get(type) ?? new Set<Handler>();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: Handler): void {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(type: string, ev: unknown = {}): void {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(ev);
  }

  count(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

class FakeDocument extends FakeTarget {
  pointerLockElement: unknown = null;
  hidden = false;
  exitPointerLock = vi.fn();
}

class FakeCanvas extends FakeTarget {
  requestPointerLock = vi.fn(() => Promise.resolve());
}

interface KeyInit {
  code: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function keyEvent(init: KeyInit) {
  return {
    code: init.code,
    repeat: init.repeat ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    preventDefault: vi.fn(),
  };
}

const g = globalThis as unknown as { window?: unknown; document?: unknown };
const originalWindow = g.window;
const originalDocument = g.document;

let fakeWindow: FakeTarget;
let fakeDocument: FakeDocument;
let canvas: FakeCanvas;

beforeEach(() => {
  fakeWindow = new FakeTarget();
  fakeDocument = new FakeDocument();
  canvas = new FakeCanvas();
  g.window = fakeWindow;
  g.document = fakeDocument;
});

afterEach(() => {
  if (originalWindow === undefined) delete g.window;
  else g.window = originalWindow;
  if (originalDocument === undefined) delete g.document;
  else g.document = originalDocument;
});

function makeInput(playing = true) {
  const calls: string[] = [];
  const host: InputHost = {
    canvas: canvas as unknown as HTMLCanvasElement,
    isPlaying: () => playing,
    onPauseToggle: () => calls.push("pause"),
    onPrimary: () => calls.push("primary"),
  };
  return { input: createInput(host), calls };
}

describe("game input", () => {
  it("reads held movement keys and scales keyboard turning by dt", () => {
    const { input } = makeInput();
    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyW" }));
    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyQ" }));
    const step = input.poll(0.5);
    expect(step.moveY).toBe(1);
    expect(step.yawDelta).toBeCloseTo(-KEY_TURN_SPEED * 0.5, 9);
    fakeWindow.dispatch("keyup", keyEvent({ code: "KeyW" }));
    expect(input.poll().moveY).toBe(0);
    input.dispose();
  });

  it("ignores game keys while a browser/OS modifier is held", () => {
    const { input } = makeInput();
    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyW", ctrlKey: true }));
    fakeWindow.dispatch("keydown", keyEvent({ code: "Space", altKey: true }));
    const step = input.poll();
    expect(step.moveY).toBe(0);
    expect(step.fire).toBe(false);
    input.dispose();
  });

  it("clears held movement and fire on blur, hiding, and pointer-lock loss", () => {
    const { input } = makeInput();
    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyW" }));
    fakeWindow.dispatch("keydown", keyEvent({ code: "Space" }));
    expect(input.poll().fire).toBe(true);

    fakeWindow.dispatch("blur");
    expect(input.poll()).toMatchObject({ moveY: 0, fire: false });

    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyW" }));
    fakeDocument.hidden = true;
    fakeDocument.dispatch("visibilitychange");
    expect(input.poll().moveY).toBe(0);

    fakeWindow.dispatch("keydown", keyEvent({ code: "Space" }));
    fakeDocument.pointerLockElement = null;
    fakeDocument.dispatch("pointerlockchange");
    expect(input.poll().fire).toBe(false);
    input.dispose();
  });

  it("releaseTriggers drops fire/yaw but not held movement", () => {
    const { input } = makeInput();
    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyW" }));
    fakeWindow.dispatch("keydown", keyEvent({ code: "Space" }));
    input.poll();
    input.releaseTriggers();
    const step = input.poll();
    expect(step.moveY).toBe(1);
    expect(step.fire).toBe(false);
    input.dispose();
  });

  it("routes Space/Enter on an overlay to onPrimary, but fire only while playing", () => {
    const overlay = makeInput(false);
    const space = keyEvent({ code: "Space" });
    fakeWindow.dispatch("keydown", space);
    fakeWindow.dispatch("keydown", keyEvent({ code: "Enter" }));
    expect(overlay.calls).toEqual(["primary", "primary"]);
    expect(space.preventDefault).toHaveBeenCalled();
    expect(overlay.input.poll().fire).toBe(false);
    overlay.input.dispose();

    const playing = makeInput(true);
    fakeWindow.dispatch("keydown", keyEvent({ code: "Space" }));
    expect(playing.input.poll().fire).toBe(true);
    playing.input.dispose();
  });

  it("routes Esc/P to the pause toggle", () => {
    const { input, calls } = makeInput();
    fakeWindow.dispatch("keydown", keyEvent({ code: "Escape" }));
    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyP" }));
    expect(calls).toEqual(["pause", "pause"]);
    input.dispose();
  });

  it("requests pointer lock on left click and fires, then clears on mouseup", () => {
    const { input } = makeInput();
    const down = { button: 0, preventDefault: vi.fn() };
    canvas.dispatch("mousedown", down);
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(input.poll().fire).toBe(true);
    fakeWindow.dispatch("mouseup");
    expect(input.poll().fire).toBe(false);
    input.dispose();
  });

  it("dispose removes every window, document, and canvas listener", () => {
    const { input } = makeInput();
    expect(fakeWindow.count()).toBeGreaterThan(0);
    expect(fakeDocument.count()).toBeGreaterThan(0);
    expect(canvas.count()).toBeGreaterThan(0);
    input.dispose();
    expect(fakeWindow.count()).toBe(0);
    expect(fakeDocument.count()).toBe(0);
    expect(canvas.count()).toBe(0);
    // A late key event cannot move a disposed input.
    fakeWindow.dispatch("keydown", keyEvent({ code: "KeyD" }));
    expect(input.poll().moveX).toBe(0);
  });
});
