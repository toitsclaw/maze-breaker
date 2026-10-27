import * as THREE from "three";
import { VIEW_H, VIEW_W } from "../constants";
import type { Enemy, GameState, MapData } from "../types";
import type { SpriteKey, SpriteSheet } from "./sprites";
import { drawHud } from "./hud";

const CAMERA_HEIGHT = 0.68;
const WALL_HEIGHT = 1.6;
const CAMERA_FOV = 42;
const FAR_PLANE = 42;

interface EnemyView {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
}

interface TextureSet {
  enemy: Record<SpriteKey, THREE.CanvasTexture>;
  flash: Record<SpriteKey, THREE.CanvasTexture>;
  exitLocked: THREE.CanvasTexture;
  exitOpenA: THREE.CanvasTexture;
  exitOpenB: THREE.CanvasTexture;
}

export interface DrawView {
  (state: GameState, sprites: SpriteSheet, reducedMotion: boolean): void;
  setResolution(width: number, height: number): void;
  dispose(): void;
}

/** Three.js world renderer with a transparent Canvas 2D HUD overlay. */
export function createViewRenderer(
  canvas: HTMLCanvasElement,
  hudCanvas: HTMLCanvasElement,
): DrawView {
  const hud = hudCanvas.getContext("2d");
  if (!hud) throw new Error("HUD Canvas 2D unavailable");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(VIEW_W, VIEW_H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171a23);
  scene.fog = new THREE.Fog(0x171a23, 7, 25);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, VIEW_W / VIEW_H, 0.05, FAR_PLANE);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x8795b8, 0x322a22, 1.55));

  const muzzleLight = new THREE.PointLight(0xffb84d, 0, 6, 1.7);
  muzzleLight.position.set(0.25, -0.12, -0.35);
  camera.add(muzzleLight);

  const worldRoot = new THREE.Group();
  const entityRoot = new THREE.Group();
  scene.add(worldRoot, entityRoot);

  let loadedMap: MapData | null = null;
  let textures: TextureSet | null = null;
  let enemyViews: EnemyView[] = [];
  let exitView: EnemyView | null = null;
  const lookTarget = new THREE.Vector3();
  let renderWidth = VIEW_W;
  let renderHeight = VIEW_H;

  const draw = ((state: GameState, sprites: SpriteSheet, reducedMotion: boolean): void => {
    if (loadedMap !== state.map) {
      clearGroup(worldRoot);
      clearGroup(entityRoot);
      disposeTextures(textures);
      textures = buildTextures(sprites);
      buildWorld(worldRoot, state.map);
      enemyViews = state.enemies.map(() => createSpriteView(entityRoot, textures!.enemy.idle));
      exitView = createSpriteView(entityRoot, textures.exitLocked);
      loadedMap = state.map;
    }

    const { x, y, dir } = state.player;
    camera.position.set(x, CAMERA_HEIGHT, y);
    lookTarget.set(x + Math.cos(dir), CAMERA_HEIGHT, y + Math.sin(dir));
    camera.lookAt(lookTarget);

    updateEnemies(enemyViews, state.enemies, textures!);
    updateExit(exitView!, state, textures!, reducedMotion);
    muzzleLight.intensity = state.fire.muzzle > 0 ? 4.2 : 0;

    renderer.render(scene, camera);
    const scale = renderWidth / VIEW_W;
    hud.setTransform(1, 0, 0, 1, 0, 0);
    hud.clearRect(0, 0, renderWidth, renderHeight);
    hud.setTransform(scale, 0, 0, scale, 0, 0);
    drawHud(hud, state, reducedMotion);
  }) as DrawView;

  draw.setResolution = (width: number, height: number): void => {
    renderWidth = width;
    renderHeight = height;
    renderer.setSize(width, height, false);
    hudCanvas.width = width;
    hudCanvas.height = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  draw.dispose = (): void => {
    clearGroup(worldRoot);
    clearGroup(entityRoot);
    disposeTextures(textures);
    renderer.dispose();
  };
  return draw;
}

function buildWorld(root: THREE.Group, map: MapData): void {
  const wallCount = [...map.cells].filter((cell) => cell === 1).length;
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, WALL_HEIGHT, 1),
    new THREE.MeshLambertMaterial({ color: 0x748097, flatShading: true }),
    wallCount,
  );
  walls.name = "maze-walls";
  const matrix = new THREE.Matrix4();
  let instance = 0;
  for (let z = 0; z < map.h; z++) {
    for (let x = 0; x < map.w; x++) {
      if (map.cells[z * map.w + x] !== 1) continue;
      matrix.makeTranslation(x + 0.5, WALL_HEIGHT / 2, z + 0.5);
      walls.setMatrixAt(instance++, matrix);
    }
  }
  walls.instanceMatrix.needsUpdate = true;
  walls.computeBoundingSphere();
  root.add(walls);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(map.w, map.h),
    new THREE.MeshLambertMaterial({ color: 0x27231f }),
  );
  floor.name = "maze-floor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(map.w / 2, 0, map.h / 2);
  root.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(map.w, map.h),
    new THREE.MeshBasicMaterial({ color: 0x171a23, side: THREE.BackSide }),
  );
  ceiling.name = "maze-ceiling";
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.set(map.w / 2, WALL_HEIGHT, map.h / 2);
  root.add(ceiling);
}

function createTexture(source: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function buildTextures(sprites: SpriteSheet): TextureSet {
  const enemy = {} as Record<SpriteKey, THREE.CanvasTexture>;
  const flash = {} as Record<SpriteKey, THREE.CanvasTexture>;
  for (const key of ["idle", "chase", "attack", "dead"] as const) {
    enemy[key] = createTexture(sprites.enemy[key]);
    flash[key] = createTexture(sprites.flash[key]);
  }
  return {
    enemy,
    flash,
    exitLocked: createTexture(sprites.exitLocked),
    exitOpenA: createTexture(sprites.exitOpenA),
    exitOpenB: createTexture(sprites.exitOpenB),
  };
}

function createSpriteView(root: THREE.Group, texture: THREE.Texture): EnemyView {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: false,
    fog: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  root.add(sprite);
  return { sprite, material };
}

function updateEnemies(views: EnemyView[], enemies: Enemy[], textures: TextureSet): void {
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const enemy = enemies[i];
    view.material.map = enemy.flash > 0
      ? textures.flash[enemy.state]
      : textures.enemy[enemy.state];
    view.sprite.position.set(enemy.x, 0.015, enemy.y);
    view.sprite.scale.set(0.72, enemy.state === "dead" ? 0.32 : 0.98, 1);
  }
}

function updateExit(
  view: EnemyView,
  state: GameState,
  textures: TextureSet,
  reducedMotion: boolean,
): void {
  view.material.map = !state.exitOpen
    ? textures.exitLocked
    : reducedMotion || state.time % 0.8 < 0.4
      ? textures.exitOpenA
      : textures.exitOpenB;
  view.sprite.position.set(state.map.exit.x + 0.5, 0.015, state.map.exit.y + 0.5);
  view.sprite.scale.set(0.42, 1.12, 1);
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    const object = child as THREE.Mesh;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  }
}

function disposeTextures(textures: TextureSet | null): void {
  if (!textures) return;
  for (const texture of [
    ...Object.values(textures.enemy),
    ...Object.values(textures.flash),
    textures.exitLocked,
    textures.exitOpenA,
    textures.exitOpenB,
  ]) texture.dispose();
}
