# Maze Breaker

A complete, lightweight retro FPS MVP for the browser: a hand-authored maze
rendered in Three.js at a fixed low internal resolution, instanced walls,
billboard "warden" enemies, a programmatically drawn pistol/HUD, and a small
minimap. It has one runtime dependency (`three`), zero gameplay network
requests, and zero image/audio assets — every texture is generated in code.

Clear every warden to unseal the exit beacon, then walk to it to win. Wardens
will hunt you by sight and by the sound of your pistol.

---

## Quick start (WSL2)

Requires Node >= 20.19 (WSL2 Ubuntu 22.04+ ships older Node; use nvm/apt or
`sudo apt install nodejs npm` from NodeSource). 4 GB RAM is plenty.

```bash
npm install     # installs Three.js plus the TypeScript/Vite/Vitest toolchain
npm run dev     # http://127.0.0.1:5173 (WSL2 localhost forwarding: open it in the Windows browser)
```

Other commands:

```bash
npm test            # vitest run — all 77 deterministic unit tests in 9 suites
npm run typecheck   # tsc --noEmit (strict)
npm run build       # vite production build -> dist/
npm run preview     # serve dist/ on http://127.0.0.1:4173
```

WSL notes:

- Open the dev URL in a Windows-side browser for the smoothest rendering
  (WSLg handles localhost forwarding automatically). A browser running inside
  WSLg also works.
- The dev server binds to loopback (`127.0.0.1`) by default. If WSL2/VM host
  forwarding cannot reach it, `npm run dev -- --host` exposes it on the local
  network — only do that on a trusted network.
- If port 5173 is already taken, run `npm run dev -- --port 5174`.
- The game runs entirely client-side and requires WebGL 2. The deliberately
  small scene and low internal resolution work well on modest integrated GPUs;
  opening it in a Windows-side browser usually gives WSL2 the smoothest path.
- To serve `dist/` without Node: `python3 -m http.server -d dist 8000`
  (module scripts need HTTP; `file://` will not work).

## Security and offline behavior

- `index.html` ships a strict Content-Security-Policy: `default-src 'none'`,
  same-origin scripts/styles/images, and `connect-src` allows same-origin plus
  `ws:`/`wss:` for Vite HMR convenience (production opens no sockets). Inline
  styles are allowed only because Vite injects CSS that way during development;
  there are no inline scripts, external fonts, media, frames, workers, or
  analytics. `referrer` is `no-referrer`.
- Gameplay issues zero network requests: sprites, HUD, level and feedback
  effects are all generated in code. The page keeps running after the server is
  stopped (once loaded) and offline.
- The canvas has an accessible label and keyboard shortcuts, the overlay is a
  labelled dialog, and status changes are announced through a polite
  `aria-live` region.

## Controls

| Action | Input |
| --- | --- |
| Move / strafe | `W A S D` |
| Turn (keyboard) | `Q E` or `Arrow Left` / `Arrow Right` |
| Turn (mouse) | Move mouse while pointer-locked; **click the view** to lock |
| Fire | `Left click` or `Space` (auto-repeat on hold) |
| Pause / resume | `Esc` or `P` |
| Start / resume / restart | `Enter` on the overlay |

Fully playable with a keyboard only: every action has a key equivalent, and
focus starts on the overlay button so `Enter` works immediately. `Esc`/`P`
pauses and releases pointer lock; the pause overlay takes focus so mouse users
can click **Resume** without fighting the lock. Losing focus, hiding the tab or
losing pointer lock clears held keys and fire state, so the player cannot get
stuck walking or firing.

Pin a deterministic run: `http://127.0.0.1:5173/?seed=1234` re-creates the same
wander behavior for the same input sequence.

**Goal:** every warden down ("7/7") unlocks the exit — the gray padlock beacon
turns green — then stand on its tile to escape. Death = defeat. The overlay
restart button (or `Enter`) rebuilds the run in place: same maze, same seed, no
page reload.

## Gameplay systems

- **Hitscan pistol** — 0.38 s cooldown, 2 hits per warden, muzzle flash lights
  the whole scene for 0.10 s, white hit-flash on enemies, gold hitmarker ("KILL"
  variant on the killing shot), screen-edge damage vignette. Targets are picked
  by the nearest *near-edge entry* distance along the ray (so a wide body whose
  edge is closer beats a small body whose centre is closer), and a wall between
  shooter and target always blocks the shot.
- **Wardens (7)** — FSM: `idle` (slow seeded wander) → `chase` (sight ≤ 8.5 m
  with line-of-sight, or gunfire noise ≤ 6.5 m through walls) → `attack`
  (0.38 s wind-up while in 0.95 m; damage lands only if you are still in range
  with LOS; 1.15 s cooldown) → `dead` (corpse sprite). Movement is the same
  swept circle-vs-grid collision as the player, plus pairwise separation and a
  hard speed cap, so they slide along walls, cannot tunnel through them in one
  step, and never clip inside.
- **Objectives** — reaching the sealed exit teases you (throttled message);
  reaching the unlocked exit wins. HP 0 loses. Pause only transitions between
  `playing` ↔ `paused`, and victory/defeat stop the simulation; restart rebuilds
  the same maze and seed without a page reload.

## Architecture

```
index.html                  WebGL canvas + transparent HUD canvas (384x216)
                            overlay, aria-live status region
src/
  main.ts                   boot, rAF loop, overlays, pause, pointer lock, focus, aria-live
  style.css                 retro frame; viewport-fixed scrollable overlay; reduced-motion guard
  input.ts                  key state, pointer-lock mouse deltas, cleanup, poll()
  ui/announce.ts            per-tick aria-live batching and repeat-announcement helper
  game/
    constants.ts            every tuning knob in one place
    types.ts                pure data shapes (MapData, Enemy, GameState…)
    level.ts                authored maze strings, parser, BFS flood fill
    raycast.ts              DDA wall checks for LOS and weapon range
    collision.ts            circle-vs-grid overlap, axis-separated slide, swept sub-steps
    combat.ts               ray-circle hitscan with wall obstruction, damage
    enemy.ts                warden FSM, wall-safe chase/wander, separation
    state.ts                createGame/resetGame/beginPlay/pause/resume/stepGame (fixed tick)
    render/
      renderer.ts           Three.js scene, camera, instanced walls, fog, sprites
      sprites.ts            generated enemy/flash/beacon CanvasTextures
      hud.ts                pistol, crosshair, hitmarker, bars, messages
      minimap.ts            local 7-cell-radius tactical map
tests/                      vitest suites (node environment, no DOM)
```

Design rules:

- **Fixed timestep** — simulation updates at exactly 60 Hz with an accumulator
  and a 0.25 s frame clamp; rendering is decoupled and runs per rAF.
- **Seeded determinism** — a single mulberry32 stream drives all randomness
  (idle wander). Same seed + same input stream ⇒ same outcome, verified by
  tests. The level itself is fully authored (no procedural generation).
- **Pure cores** — `castRay`, `hasLineOfSight`, `circleHitsWall`/`moveCircle`,
  `hitscan`/`applyDamage`, `updateEnemy`, `floodReachable` and the objective
  mutations are plain functions on plain data; DOM code exists only in
  `main.ts`, `input.ts` and `render/*`.
- **Responsive framing** — the canvas scales to fit the viewport height, and
  the start/pause/victory overlay is fixed to the viewport with its own
  scrolling, so the title, controls and Resume button stay reachable down to
  very short/narrow windows.
- **Cleanup** — input listeners are named and fully removed on hot reload, and
  pointer lock is released whenever the game leaves `playing` mode.

### Test coverage (tests/)

- **raycast** — exact DDA wall hits (straight/diagonal/behind), max-range null,
  out-of-bounds termination, LOS clear/blocked.
- **collision** — wall blocking, axis-separated sliding, head-on clearance,
  corner slide, bound clamping, wall-footprint detection, and no tunneling
  through a thin wall during one large (swept) step.
- **combat** — nearest-target selection, nearest *near-edge* ordering, radius
  edge hits, off-axis misses, wall obstruction and its distance, range cap,
  diagonal rays, damage/kill semantics, dead-target filtering.
- **enemy** — every FSM transition (incl. LOS/no-LOS aggro, wind-up damages
  only in range with sight, cooldown gating), wall-safe chase/wander with speed
  bounds (including wall-sliding), frozen corpses, wind-up LOS requirement.
- **level** — parse dimensions, spawn/enemy/exit validity, flood-fill
  reachability of *every* open cell, exactly one connected room component,
  deterministic parse.
- **objectives + restart** — menu→play, pause/resume transitions and events,
  zero-HP defeat guard, kill accounting and feedback timers, sealed-exit tease,
  unlock at last kill, victory, defeat drain, event stream, restart parity with
  the same seed, whole-run determinism.
- **input** — held movement, dt-scaled keyboard turning, modifier bypass,
  clearing held keys on blur/hide/pointer-lock loss, trigger release, overlay
  Enter/Space routing, pointer lock + fire on click, complete listener removal.
- **announce** — aria-live batching (no dropped events), duplicate/empty
  filtering, repeat announcements with invisible suffixes.
- **rng** — stream identity across same seed, divergence across seeds, bounds,
  uint32 seed wrapping.

## Performance notes (WSL / 4 GB RAM target)

- The WebGL renderer is fixed at **384×216** (≈83k pixels), pixel ratio 1,
  antialiasing off, and `powerPreference: low-power`. CSS scales the result, so
  a large window does not increase the number of rendered pixels.
- Every wall cube is an instance of one `InstancedMesh`, keeping the maze to a
  single wall draw call. The seven wardens and exit are lightweight billboards.
- There are no shadows, post-processing passes, models, downloaded textures,
  or runtime asset requests. Generated sprite textures use nearest filtering.
- The deterministic collision, line-of-sight, AI, and hitscan core stays on the
  CPU and is independent of Three.js, which keeps tests fast and repeatable.
- Falls back gracefully: pointer lock denial never blocks play (keyboard-only
  turning remains); `prefers-reduced-motion` stills the beacon pulse, disables
  weapon bob, and (via CSS) removes overlay transitions. Small/short viewports
  scroll the overlay instead of clipping the Resume button.

## Limitations

- WebGL 2 is required; very old browsers or machines without WebGL support
  cannot run the renderer.
- Flat-shaded primitive geometry only: no wall textures or pitch look.
- One weapon, no ammo economy, no audio (deliberately — keeps the bundle tiny
  and avoids WebAudio quirks under WSL).
- Wardens rush in straight lines with axis fallback steering; no pathfinding
  (A*) — open corners are handled by wall-sliding, not graph search.
- Single fixed seeded default per session (`Date.now()` unless `?seed=`).
- Enemy corpses remain as pass-through scenery; hitscan ignores them.
- Internal HUD text is chunky by design (pixel-scale UI at 384×216).

## License

MIT — see `LICENSE`.
