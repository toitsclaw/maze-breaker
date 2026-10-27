import type { GameMode, GameState } from "./game/types";

export type SoundCue =
  | "shot"
  | "hit"
  | "kill"
  | "hurt"
  | "unlock"
  | "victory"
  | "defeat"
  | "step";

export interface SoundSnapshot {
  mode: GameMode;
  hp: number;
  kills: number;
  exitOpen: boolean;
  muzzle: number;
  hitmarker: number;
  bob: number;
}

export function snapshotSound(state: GameState): SoundSnapshot {
  return {
    mode: state.mode,
    hp: state.player.hp,
    kills: state.kills,
    exitOpen: state.exitOpen,
    muzzle: state.fire.muzzle,
    hitmarker: state.fire.hitmarker,
    bob: state.player.bob,
  };
}

/** Derive one-shot audio cues without coupling sound to the simulation. */
export function soundCues(previous: SoundSnapshot, current: SoundSnapshot): SoundCue[] {
  const cues: SoundCue[] = [];
  if (current.muzzle > previous.muzzle) cues.push("shot");
  if (current.hitmarker > previous.hitmarker) {
    cues.push(current.kills > previous.kills ? "kill" : "hit");
  }
  if (current.hp < previous.hp) cues.push("hurt");
  if (!previous.exitOpen && current.exitOpen) cues.push("unlock");
  if (previous.mode !== "victory" && current.mode === "victory") cues.push("victory");
  if (previous.mode !== "defeat" && current.mode === "defeat") cues.push("defeat");
  if (current.mode === "playing" && Math.floor(current.bob / Math.PI) > Math.floor(previous.bob / Math.PI)) {
    cues.push("step");
  }
  return cues;
}

export interface GameAudio {
  unlock(): void;
  sync(state: GameState): void;
  reset(state: GameState): void;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  dispose(): void;
}

/** Small synthesized soundscape: no files, decoders, or network requests. */
export function createGameAudio(initialState: GameState): GameAudio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  let volume = 0.55;
  let previous = snapshotSound(initialState);

  function ensureContext(): AudioContext | null {
    if (!enabled) return null;
    if (!context) {
      const AudioContextCtor = window.AudioContext;
      if (!AudioContextCtor) return null;
      context = new AudioContextCtor();
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
    }
    if (context.state === "suspended") void context.resume();
    return context;
  }

  function tone(frequency: number, duration: number, gain: number, type: OscillatorType = "square", endFrequency = frequency): void {
    const ctx = ensureContext();
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function play(cue: SoundCue): void {
    switch (cue) {
      case "shot": tone(150, 0.12, 0.2, "sawtooth", 45); break;
      case "hit": tone(760, 0.055, 0.08, "square", 520); break;
      case "kill":
        tone(520, 0.09, 0.1, "square", 780);
        tone(780, 0.14, 0.08, "square", 1040);
        break;
      case "hurt": tone(95, 0.22, 0.15, "sawtooth", 55); break;
      case "unlock":
        tone(330, 0.18, 0.08, "triangle", 660);
        tone(660, 0.3, 0.07, "triangle", 990);
        break;
      case "victory":
        tone(392, 0.22, 0.08, "triangle", 523);
        tone(523, 0.34, 0.08, "triangle", 784);
        break;
      case "defeat": tone(180, 0.65, 0.11, "sawtooth", 45); break;
      case "step": tone(70, 0.045, 0.025, "triangle", 45); break;
    }
  }

  return {
    unlock(): void { ensureContext(); },
    sync(state: GameState): void {
      const current = snapshotSound(state);
      if (enabled) for (const cue of soundCues(previous, current)) play(cue);
      previous = current;
    },
    reset(state: GameState): void { previous = snapshotSound(state); },
    setEnabled(next: boolean): void {
      enabled = next;
      if (master) master.gain.value = enabled ? volume : 0;
    },
    setVolume(next: number): void {
      volume = Math.max(0, Math.min(1, next));
      if (master) master.gain.value = enabled ? volume : 0;
    },
    dispose(): void {
      if (context) void context.close();
      context = null;
      master = null;
    },
  };
}
