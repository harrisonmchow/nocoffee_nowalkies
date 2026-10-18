import {
  AgXToneMapping,
  DataTexture,
  DirectionalLight,
  HemisphereLight,
  LinearMipmapLinearFilter,
  LinearFilter,
  MathUtils,
  RGBAFormat,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  type PerspectiveCamera,
} from 'three';
import type { BiomeId } from '../data/biomes';
import { CameraRig, type OrbitSpec, type Pose } from './camera/rig';
import { Director, type CampTarget, type Target } from './director/director';
import type { DevSwitches } from './flags';
import type { CampItem, CampMap, WorldRoute } from './route';
import { createAurora } from './scene/aurora';
import { applyParams, type BiomeParams } from './scene/biomes';
import { buildBiomeSet, camerasFor, stationFrom, type BiomeSet, type StationSpec } from './scene/biome-set';
import type { Pickable } from './scene/camp';
import { createClouds } from './scene/clouds';
import { createFlyThrough } from './scene/fly-through';
import { createForegroundClouds } from './scene/foreground-clouds';
import { createSky } from './scene/sky';
import { requestNoise } from './scene/terrain-client';
import { terrainFor } from './scene/terrain-fields';
import { createTerrainMaterial, TERRAIN_VIEWS, type TerrainView } from './scene/terrain';
import { WorldClock } from './systems/clock';
import { createPointerField } from './systems/pointer';
import type { Quality, Tier } from './systems/quality';
import { createRandom } from './systems/random';
import { createWorldUniforms } from './systems/uniforms';

export type WorldOptions = {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  quality: Quality;
  dev: DevSwitches;
  /** prefers-reduced-motion: cuts instead of moves, and nothing animates. */
  motion: 'full' | 'reduced';
  /** This browser asked for the world (?world=on): show camps that aren't ready for visitors yet. */
  preview: boolean;
};

/** Where the visitor is in a camp: its landscape, the campsite, or inside the tent. */
export type Level = 'landscape' | 'camp' | 'tent';

/** Detail per tier (GEAR-3D-PLAN.md §7). */
const TIERS: Record<Tier, {
  resolution: number; starLayers: number; puffs: number; trees: number;
  aurora: { width: number; height: number; steps: number; every: number };
}> = {
  high: { resolution: 208, starLayers: 2, puffs: 64, trees: 1400, aurora: { width: 512, height: 128, steps: 40, every: 1 } },
  mid: { resolution: 160, starLayers: 2, puffs: 24, trees: 800, aurora: { width: 384, height: 96, steps: 32, every: 2 } },
  low: { resolution: 112, starLayers: 1, puffs: 8, trees: 350, aurora: { width: 256, height: 64, steps: 24, every: 4 } },
};

const SEED = 1;
/** The site's bone (#f7f6f3), which the world clears to on paper. */
const BONE = 0xf7f6f3;
/** Seconds to fly into the tent and back out. */
const TENT_FLIGHT = 1.1;

/**
 * The one renderer behind the gear pages. It lives in #world, which the
 * ClientRouter carries across gear pages, so it starts once per visit. Each
 * gear page tells it what to show (setRoute); the Director gets it there.
 */
export class World {
  readonly container: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig = new CameraRig();
  readonly clock: WorldClock;
  readonly random: () => number;
  readonly quality: Quality;
  readonly uniforms = createWorldUniforms();
  readonly director: Director;
  readonly motion: 'full' | 'reduced';
  /** Resolves after the first frame is drawn. */
  readonly firstFrame: Promise<void>;
  route: WorldRoute = { level: 'detail' };
  camps: CampMap = {};
  readonly preview: boolean;
  /** Inside the tent (the campsite's sub-view, with no page of its own). */
  inside = false;

  private markDrawn!: () => void;
  private readonly settings: (typeof TIERS)[Tier];
  private readonly lights = { sun: new DirectionalLight(0xffffff, 1), hemi: new HemisphereLight(0xffffff, 0x444444, 1) };
  private readonly sky;
  private readonly clouds;
  private readonly pointer;
  private readonly flyThrough;
  private readonly foreground;
  private readonly forward = new Vector3();
  private readonly projected = new Vector3();
  private aurora: ReturnType<typeof createAurora> | null = null;
  private readonly terrainMaterial;
  private noise: Promise<DataTexture>;
  private readonly cameras = new Map<BiomeId, ReturnType<typeof camerasFor>>();
  private readonly sets = new Map<BiomeId, Promise<BiomeSet>>();
  private readonly built = new Map<BiomeId, BiomeSet>();
  private shown: BiomeSet | null = null;
  /** The campsite's kit, from its page, for whichever camp it belongs to. */
  private kit: { biome: BiomeId; person: string; items: CampItem[]; dog: boolean } | null = null;
  private insideShown = 0;
  private panelOpen = false;
  /** Tests: keep the landscape's camera from following the pointer. */
  lookHeld = false;
  /** What's planted at each camp grows from this (?seed=, 1 by default). */
  private readonly plantSeed: number;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private frameRequest = 0;
  private looping = false;
  private contextLost = false;
  private disposed = false;
  private frameCount = 0;
  /** A camp just built, to draw once into one pixel of the next frame so its buffers and pipelines are warm. */
  private warm: BiomeSet | null = null;
  /** When the Director started holding at the gate (ms), for the tab bar's loading line. */
  private heldSince = -1;
  /** Tests: delay each camp's build, to exercise the hold at the gate. */
  prepareDelay = 0;
  private readonly renderListeners = new Set<() => void>();
  private readonly levelListeners = new Set<(level: Level | null) => void>();
  private lastLevel: Level | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly listeners = new AbortController();
  private readonly halfFloat: boolean;
  /** Recent frame times in ms, for tests and the debug panel. */
  readonly frameTimes: number[] = [];

  constructor({ container, canvas, gl, quality, dev, motion, preview }: WorldOptions) {
    this.container = container;
    this.preview = preview;
    this.quality = quality;
    this.motion = motion;
    this.settings = TIERS[quality.tier];
    // Reduced motion freezes scene time: clouds, aurora, fire and embers hold still.
    this.clock = new WorldClock({ frozen: dev.freeze || motion === 'reduced', time: dev.freeze ? dev.time : 4 });
    this.random = createRandom(dev.seed);
    this.plantSeed = dev.seed;
    this.firstFrame = new Promise((resolve) => (this.markDrawn = resolve));

    // three r186 requires WebGL2, but its typings still name the WebGL1 context type.
    this.renderer = new WebGLRenderer({ canvas, context: gl as unknown as WebGLRenderingContext });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = AgXToneMapping;
    this.renderer.setClearColor(BONE, 1);
    this.applyPixelRatio();
    this.halfFloat = this.renderer.extensions.has('EXT_color_buffer_float') || this.renderer.extensions.has('EXT_color_buffer_half_float');

    const u = this.uniforms;
    this.scene.add(this.lights.sun, this.lights.hemi);
    this.sky = createSky(u, this.settings.starLayers);
    this.scene.add(this.sky.mesh);
    this.pointer = createPointerField(this.renderer, this.halfFloat);
    u.tPointer.value = this.pointer.texture;
    this.clouds = createClouds(u, { puffs: this.settings.puffs, starLayers: this.settings.starLayers });
    this.scene.add(this.clouds.group);
    this.flyThrough = createFlyThrough(u, this.settings.starLayers);
    this.scene.add(this.flyThrough.mesh);
    this.foreground = createForegroundClouds(u, this.settings.starLayers);
    this.scene.add(this.foreground.mesh);
    this.terrainMaterial = createTerrainMaterial(u, this.settings.starLayers);
    this.noise = requestNoise(256, dev.seed + 41).then((data) => {
      const texture = new DataTexture(data, 256, 256, RGBAFormat, UnsignedByteType);
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      u.tNoise.value = texture;
      return texture;
    });

    this.director = new Director({
      rig: this.rig,
      aspect: () => this.aspect,
      restPose: (target) => this.restPose(target),
      settle: (target) => this.settle(target),
      prepare: (biome) => this.prepare(biome),
      show: (biome) => this.show(biome),
      apply: (params, limbo, paper, fly, flyTime) => this.apply(params, limbo, paper, fly, flyTime),
    });
    this.director.setSpeed(quality.tier !== 'high');
    this.director.manual = dev.freeze;
    this.apply(this.director.params, 0, 1, 0, 0);

    const { signal } = this.listeners;
    canvas.addEventListener('webglcontextlost', () => {
      this.contextLost = true;
      container.dataset.contextLost = '';
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      delete container.dataset.contextLost;
      this.wake();
    }, { signal });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.sleep() : this.wake()), { signal });
    // The person panel's setup details opening or closing reframes the shot.
    document.addEventListener('gear:panel', (event) => {
      this.panelOpen = Boolean((event as CustomEvent<{ open: boolean }>).detail?.open);
      this.measureStage();
      this.wake();
    }, { signal });
    this.watchPixelRatio();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  get aspect() {
    return (this.container.clientWidth || 1) / (this.container.clientHeight || 1);
  }

  /** Called with each gear page's route as the visitor moves around. */
  setRoute(route: WorldRoute) {
    this.route = route;
    const target = this.targetFor(route);
    // A person whose camp isn't shown keeps the 2D figure: 'figure', not 'biome', for the CSS.
    const camp = route.level === 'biome' || route.level === 'camp';
    document.documentElement.dataset.level = camp && target.kind === 'paper' ? 'figure' : route.level;
    // A new page starts with its setup details folded away.
    this.panelOpen = false;
    if (this.inside) this.leaveTent(true);
    if (route.level === 'camp' && target.kind === 'biome') {
      this.kit = { biome: target.biome, person: route.person, items: route.items, dog: Boolean(route.camp?.dog) };
      this.dressKit();
    }
    this.measureStage();
    this.director.go(target, this.motion);
    this.director.swapped(target);
    this.wake();
    this.emitLevel();
  }

  /** The target for a URL path, before its page has arrived (used on astro:before-preparation). */
  targetForPath(path: string): Target {
    const match = /^\/gear\/([a-z0-9-]+)\/(camp\/)?$/.exec(path);
    const biome = this.campFor(match?.[1]);
    return biome ? { kind: 'biome', biome, view: match?.[2] ? 'camp' : 'landscape' } : { kind: 'paper' };
  }

  /** The camp to show for a person, if any: ready ones for everyone, the rest only in preview. */
  campFor(person: string | undefined): BiomeId | undefined {
    const camp = person ? this.camps[person] : undefined;
    return camp && (camp.ready || this.preview) ? camp.biome : undefined;
  }

  /** Where the visitor is now, once any move has finished: null on paper or mid-transition. */
  get level(): Level | null {
    if (this.director.active) return null;
    const target = this.director.resting;
    if (target.kind !== 'biome') return null;
    if (target.view === 'landscape') return 'landscape';
    return this.inside ? 'tent' : 'camp';
  }

  /** Hear when the level changes (to show the right hotspots and hints). */
  onLevel(listener: (level: Level | null) => void) {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  }

  /** Start building a biome early, e.g. when a tab is hovered. Resolves when it's ready to show. */
  prefetch(biome: BiomeId): Promise<void> {
    return this.prepare(biome);
  }

  // --------------------------------------------------------------- controls

  /**
   * Zoom the landscape toward the camp (scrolling). Returns true once it has
   * gone all the way, when the page should go on to the campsite.
   */
  zoomBy(amount: number): boolean {
    if (this.level !== 'landscape') return false;
    this.rig.zoom = MathUtils.clamp(this.rig.zoom + amount, 0, 1);
    this.wake();
    return this.rig.zoom >= 1;
  }

  /** Turn the campsite's orbit by a drag, in pixels. */
  orbitBy(dx: number, dy: number) {
    if (this.level !== 'camp') return;
    this.rig.orbitBy(dx, dy);
    this.wake();
  }

  /** Dolly in or out of the campsite. Returns how far past the far limit it was asked to go. */
  dollyBy(factor: number): number {
    if (this.level !== 'camp') return 0;
    const over = this.rig.dolly(factor);
    this.wake();
    return over;
  }

  /** The pickable under a point on screen (client pixels), if any, for the current level. */
  pickAt(clientX: number, clientY: number): Pickable | null {
    const level = this.level;
    if (!this.shown || (level !== 'camp' && level !== 'tent')) return null;
    const rect = this.container.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const candidates = this.shown.camp.pickables.filter((p) => p.inside === (level === 'tent'));
    let best: { pickable: Pickable; distance: number } | null = null;
    for (const pickable of candidates) {
      const hit = this.raycaster.intersectObject(pickable.object, true)[0];
      if (hit && (!best || hit.distance < best.distance)) best = { pickable, distance: hit.distance };
    }
    return best?.pickable ?? null;
  }

  /** The pickables for the current level, for hotspots. */
  get pickables(): Pickable[] {
    const level = this.level;
    if (!this.shown || (level !== 'camp' && level !== 'tent')) return [];
    return this.shown.camp.pickables.filter((p) => p.inside === (level === 'tent'));
  }

  /** Light up a pickable (or nothing). */
  setHighlight(id: string | null) {
    this.shown?.camp.setHighlight(id);
    this.requestRender();
  }

  /** Where a world point lands on screen, in client pixels; `behind` if it's behind the camera. */
  toScreen(point: Vector3, out = { x: 0, y: 0, behind: false }) {
    const v = point.clone().project(this.rig.camera);
    const rect = this.container.getBoundingClientRect();
    out.x = rect.left + ((v.x + 1) / 2) * rect.width;
    out.y = rect.top + ((1 - v.y) / 2) * rect.height;
    out.behind = v.z > 1;
    return out;
  }

  /** The camp's own spot (its fire), for the landscape's marker. */
  get campPoint(): Vector3 | null {
    return this.shown ? this.shown.camp.fireAt.clone().add(new Vector3(0, 1.5, 0)) : null;
  }

  /** Into the tent: fly to look in through its ghosted fly. */
  enterTent() {
    if (this.level !== 'camp' || !this.shown) return;
    this.inside = true;
    this.measureStage();
    this.rig.flyTo(this.shown.camp.insidePose(), this.motion === 'reduced' ? 0.001 : TENT_FLIGHT, () => {
      this.rig.setStation(this.shown!.camp.insidePose());
      this.emitLevel();
    });
    this.wake();
    this.emitLevel();
  }

  /** Out of the tent, back to where you were orbiting. */
  leaveTent(immediate = false) {
    if (!this.inside) return;
    this.inside = false;
    this.measureStage();
    const orbit = this.orbitFor(this.shown?.id);
    if (!orbit || immediate) {
      if (orbit) this.rig.setOrbit(orbit, true);
      this.insideShown = 0;
      this.shown?.camp.setInside(0);
      return;
    }
    const back = this.rig.orbitPose(orbit, this.rig.orbitAngles);
    this.rig.flyTo(back, this.motion === 'reduced' ? 0.001 : TENT_FLIGHT, () => {
      this.rig.setOrbit(orbit, true);
      this.emitLevel();
    });
    this.wake();
    this.emitLevel();
  }

  /** Draw on the next animation frame. */
  requestRender() {
    if (this.frameRequest || this.disposed || this.looping) return;
    this.frameRequest = requestAnimationFrame((timestamp) => {
      this.frameRequest = 0;
      this.frame(timestamp, 1 / 60);
    });
  }

  /** Draw immediately, without advancing time. */
  render() {
    if (this.disposed || this.contextLost) return;
    this.draw();
  }

  /** Tests: advance n frames of 1/60 s (pointer history and springs), then draw. */
  step(frames: number) {
    for (let i = 0; i < frames; i++) this.advance(1 / 60, true);
    this.draw();
  }

  setView(view: TerrainView) {
    this.uniforms.uDebugView.value = Math.max(0, TERRAIN_VIEWS.indexOf(view));
    if (view === 'final') this.uniforms.uDebugView.value = 0;
    this.requestRender();
  }

  /** Debug: the sea's crest metric (10), true depth (11) and Fresnel (12). */
  setSeaView(view: 'crest' | 'depth' | 'fresnel' | 'off') {
    this.uniforms.uDebugView.value = { crest: 10, depth: 11, fresnel: 12, off: 0 }[view];
    this.requestRender();
  }

  /** Debug: cloud density (8) and pointer history (9) views on the cloud layers. */
  setCloudView(view: 'density' | 'pointer' | 'off') {
    this.uniforms.uDebugView.value = view === 'density' ? 8 : view === 'pointer' ? 9 : 0;
    this.requestRender();
  }

  onRender(listener: () => void) {
    this.renderListeners.add(listener);
    return () => this.renderListeners.delete(listener);
  }

  get shownBiome() {
    return this.shown?.id ?? null;
  }

  /** Camps whose sets have been requested (prefetched or shown), in order. */
  get builtBiomes(): BiomeId[] {
    return [...this.sets.keys()];
  }

  /** Ground height of the shown camp's terrain, for tests and placing things. */
  heightAt(x: number, z: number) {
    return this.shown ? this.shown.spec.height(x, z) : 0;
  }

  /** Dev: reframe the shown camp's landscape without a rebuild. */
  setStation(spec: StationSpec) {
    const biome = this.shown?.id;
    if (!biome) return;
    const cameras = this.camerasOf(biome);
    cameras.landscape = stationFrom(spec, terrainFor(biome, SEED).camp);
    if (this.level === 'landscape') this.rig.setStation(cameras.landscape, cameras.approach);
  }

  dispose() {
    this.disposed = true;
    this.sleep();
    cancelAnimationFrame(this.frameRequest);
    this.resizeObserver.disconnect();
    this.listeners.abort();
    this.clock.dispose();
    this.rig.dispose();
    this.built.forEach((set) => set.dispose());
    this.sky.dispose();
    this.clouds.dispose();
    this.pointer.dispose();
    this.flyThrough.dispose();
    this.foreground.dispose();
    this.aurora?.dispose();
    this.terrainMaterial.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------- internals

  private emitLevel() {
    const level = this.level;
    if (level === this.lastLevel) return;
    this.lastLevel = level;
    this.levelListeners.forEach((listener) => listener(level));
  }

  /**
   * Centre the shot. With the setup details open, on the person page's stage
   * (left of the panel on desktop, above it on phones); folded away, on the
   * screen, so the camp has the room. Measured with the page scrolled to the
   * top, so scrolling doesn't move the framing.
   */
  private measureStage() {
    const camp = this.route.level === 'biome' || this.route.level === 'camp';
    const stage = camp ? document.querySelector<HTMLElement>('[data-stage]') : null;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const oneColumn = window.innerWidth <= 860;
    // With reduced motion the shot jumps to its new framing rather than sliding there.
    const jump = this.motion === 'reduced';
    if (!stage || (!this.panelOpen && !oneColumn)) {
      // Minimized, the panel is a small card in the top right: keep the subject a little left of
      // centre (further left in the tent, whose ridge stands tall in the shot), and a little below
      // it, which leaves each landscape's sky its room. Each landscape camera is placed so its
      // camp is at the middle of the unshifted frame, so here it sits 60% of the way down.
      this.rig.setFrameCentre(stage ? (this.inside ? 0.42 : 0.47) : 0.5, stage ? 0.6 : 0.5, jump);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    this.rig.setFrameCentre((rect.left + rect.width / 2) / width, (top + rect.height / 2) / height, jump);
  }

  private targetFor(route: WorldRoute): Target {
    if ((route.level === 'biome' || route.level === 'camp') && route.camp && (route.camp.ready || this.preview)) {
      return { kind: 'biome', biome: route.camp.biome, view: route.level === 'camp' ? 'camp' : 'landscape' };
    }
    return { kind: 'paper' };
  }

  // Cameras are data, so the Director can plan a path before the set exists.
  private camerasOf(biome: BiomeId) {
    let cameras = this.cameras.get(biome);
    if (!cameras) {
      cameras = camerasFor(biome, terrainFor(biome, SEED));
      this.cameras.set(biome, cameras);
    }
    return cameras;
  }

  /** The campsite's orbit, a step further out on tall screens. */
  private orbitFor(biome: BiomeId | undefined): OrbitSpec | null {
    if (!biome) return null;
    const orbit = this.camerasOf(biome).orbit;
    const portrait = MathUtils.clamp((1 - this.aspect) / 0.55, 0, 1);
    return { ...orbit, distance: orbit.distance * (1 + 0.2 * portrait), fov: MathUtils.lerp(orbit.fov, 56, portrait) };
  }

  private restPose(target: CampTarget): Pose {
    const cameras = this.camerasOf(target.biome);
    if (target.view === 'camp') return this.rig.orbitPose(this.orbitFor(target.biome)!);
    return this.rig.framed(cameras.landscape, this.aspect);
  }

  private settle(target: CampTarget) {
    const cameras = this.camerasOf(target.biome);
    this.inside = false;
    if (target.view === 'camp') {
      this.rig.setOrbit(this.orbitFor(target.biome)!);
    } else {
      this.rig.zoom = 0;
      this.rig.setStation(cameras.landscape, cameras.approach);
    }
    queueMicrotask(() => this.emitLevel());
  }

  /** Put the campsite's kit in place, once its camp is built. */
  private dressKit() {
    const kit = this.kit;
    const set = kit && this.built.get(kit.biome);
    if (kit && set) set.camp.setKit(kit.person, kit.items, kit.dog);
  }

  private prepare(biome: BiomeId): Promise<void> {
    let set = this.sets.get(biome);
    if (!set) {
      const delay = this.prepareDelay;
      set = this.noise.then(async () => {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return buildBiomeSet(biome, {
          uniforms: this.uniforms,
          terrainMaterial: this.terrainMaterial,
          starLayers: this.settings.starLayers,
          resolution: this.settings.resolution,
          puffs: this.settings.puffs,
          trees: this.settings.trees,
          seed: SEED,
          plants: this.plantSeed,
        });
      });
      this.sets.set(biome, set);
    }
    return set.then(async (built) => {
      if (!this.built.has(biome)) {
        this.built.set(biome, built);
        this.scene.add(built.group);
        this.renderer.initTexture(built.heightTexture);
        // A real tent in the person's gear is pitched now, so it's seen from the landscape and compiled with the rest.
        built.camp.pitchTent(Object.values(this.camps).find((c) => c?.biome === biome)?.tent);
        if (this.kit?.biome === biome) this.dressKit();
        // Compile while hidden, so the first frame of the reveal doesn't stall.
        // Hide the camp on show for the call: programs are keyed on the light
        // count, and only one camp's lights are ever on at a time. The cloud
        // to dive through compiles now too.
        const wasVisible = built.group.visible;
        const current = this.shown && this.shown !== built ? this.shown.group : null;
        const currentVisible = current?.visible ?? false;
        const flyVisible = this.flyThrough.mesh.visible;
        const foregroundVisible = this.foreground.mesh.visible;
        built.group.visible = true;
        this.flyThrough.mesh.visible = true;
        this.foreground.mesh.visible = true;
        if (current) current.visible = false;
        const compiling = this.renderer.compileAsync(this.scene, this.rig.camera);
        built.group.visible = wasVisible;
        this.flyThrough.mesh.visible = flyVisible;
        this.foreground.mesh.visible = foregroundVisible;
        if (current) current.visible = currentVisible;
        await compiling;
        // Its first real draw uploads its buffers (and, on Metal, builds pipelines); do that on the next frame, out of sight.
        if (this.shown !== built) this.warm = built;
        this.requestRender();
        this.evict();
      }
    });
  }

  /** Keep at most three camps' geometry around. */
  private evict() {
    const keep = this.settings === TIERS.high ? 4 : 3;
    if (this.built.size <= keep) return;
    for (const [id, set] of this.built) {
      if (this.built.size <= keep) break;
      if (set === this.shown) continue;
      this.scene.remove(set.group);
      set.dispose();
      this.built.delete(id);
      this.sets.delete(id);
    }
  }

  private show(biome: BiomeId) {
    const set = this.built.get(biome);
    if (!set) return;
    if (this.shown && this.shown !== set) {
      this.shown.group.visible = false;
      this.shown.camp.setInside(0);
      this.shown.camp.setHighlight(null);
    }
    set.group.visible = true;
    this.shown = set;
    this.insideShown = 0;
    this.uniforms.tHeight.value = set.heightTexture;
    this.uniforms.uHeightBounds.value.copy(set.heightBounds);
    this.clouds.setPuffs(set.puffs, set.puffSize);
  }

  private apply(params: BiomeParams, limbo: number, paper: number, fly: number, flyTime: number) {
    applyParams(params, this.uniforms, this.lights, this.renderer);
    this.uniforms.uLimbo.value = limbo;
    this.uniforms.uPaper.value = paper;
    this.flyThrough.set(fly, flyTime);
  }

  /** Keep drawing every frame while anything moves; idle on paper. */
  private get wantsLoop() {
    if (document.hidden || this.contextLost) return false;
    if (this.director.active || this.rig.settling) return true;
    if (this.director.paper >= 1) return false;
    if (this.motion === 'full' && !this.clock.frozen) return true;
    // Frozen or reduced: keep going only while the tent's fly is still fading.
    return Math.abs(this.insideShown - (this.inside ? 1 : 0)) > 0.001;
  }

  /** Run the loop if anything needs drawing; otherwise draw one frame. */
  wake() {
    if (this.disposed) return;
    if (this.wantsLoop && !this.looping) {
      this.looping = true;
      let last = performance.now();
      this.renderer.setAnimationLoop((timestamp) => {
        const dt = Math.min(0.1, Math.max(0, (timestamp - last) / 1000));
        this.frameTimes.push(timestamp - last);
        if (this.frameTimes.length > 240) this.frameTimes.shift();
        last = timestamp;
        this.frame(timestamp, dt);
        if (!this.wantsLoop) this.sleep();
      });
    } else {
      this.requestRender();
    }
  }

  private sleep() {
    if (!this.looping) return;
    this.looping = false;
    this.renderer.setAnimationLoop(null);
  }

  private frame(timestamp: number, dt: number) {
    if (this.disposed || this.contextLost || document.hidden) return;
    this.clock.update(timestamp);
    this.advance(dt, false);
    this.draw();
  }

  private advance(dt: number, stepping: boolean) {
    const u = this.uniforms;
    u.uTime.value = this.clock.elapsed;
    this.director.update(stepping ? 0 : dt);
    // Still waiting for the next camp after 3 s: a thin line in the tab bar says so (GEAR-3D-PLAN.md §5.1).
    const now = performance.now();
    if (!this.director.holding) this.heldSince = -1;
    else if (this.heldSince < 0) this.heldSince = now;
    const waiting = this.heldSince >= 0 && now - this.heldSince > 3000;
    if (waiting !== 'worldWait' in document.documentElement.dataset) {
      if (waiting) document.documentElement.dataset.worldWait = '';
      else delete document.documentElement.dataset.worldWait;
    }
    // On paper (between camps) the tabs over the scene turn to ink, or they'd be white on white (world.css).
    const papered = this.director.paper > 0.5;
    if (papered !== 'worldPaper' in document.documentElement.dataset) {
      if (papered) document.documentElement.dataset.worldPaper = '';
      else delete document.documentElement.dataset.worldPaper;
    }
    const resting = !this.director.active;
    if (resting) this.rig.lookWeight = Math.min(1, this.rig.lookWeight + dt / 0.6);
    this.rig.update(dt, this.aspect, this.motion === 'full' && this.rig.mode === 'station' && !this.lookHeld);
    // The tent's fly fades as you go in, and comes back as you leave.
    const goal = this.inside ? 1 : 0;
    this.insideShown += (goal - this.insideShown) * (1 - Math.exp(-5 * dt));
    if (Math.abs(goal - this.insideShown) < 0.002) this.insideShown = goal;
    this.shown?.camp.setInside(this.insideShown);
    this.sky.update(this.rig.camera);
    this.clouds.update(this.rig.camera);
    this.updateForeground();
    this.shown?.update(this.rig.camera);
    this.shown?.camp.update(this.clock.elapsed, u.uFireGain.value, u.uTentGlow.value);
    this.pointer.update(dt, this.aspect, this.motion === 'full');
    u.tPointer.value = this.pointer.texture;
    if (resting) this.emitLevel();
  }

  /** The cloud close in front of the landscape: there while you look at it, thinning as you fly in, gone for the dive. */
  private updateForeground() {
    const camera = this.rig.camera;
    // The rig holds a station for the tent's inside view too, so ask the Director: resting on a
    // landscape (or diving from one, until the cut), or heading to one (rising, from the cut).
    const isLandscape = (target: Target) => target.kind === 'biome' && target.view === 'landscape';
    const landscape = this.rig.mode === 'station' && !this.inside && this.shown !== null
      && (isLandscape(this.director.resting) || isLandscape(this.director.target));
    const zoom = this.rig.zoomed;
    const amount = landscape ? (1 - MathUtils.smoothstep(zoom, 0.25, 0.85)) * (1 - this.director.fly) : 0;
    let camp: { x: number; y: number } | null = null;
    const point = landscape ? this.campPoint : null;
    if (point) {
      const v = this.projected.copy(point).project(camera);
      if (v.z < 1) camp = { x: (v.x + 1) / 2, y: (v.y + 1) / 2 };
    }
    camera.getWorldDirection(this.forward);
    this.foreground.update(amount, zoom, this.forward, camera.fov, camp);
  }

  private draw() {
    const u = this.uniforms;
    const camera = this.rig.camera;
    this.drawWarm(camera);
    u.uPixelAngle.value = (this.rig.visibleFov * Math.PI) / 180 / Math.max(1, this.renderer.domElement.height);
    if (u.uAurora.value > 0.001 && u.uPaper.value < 0.999) {
      this.aurora ??= createAurora(this.renderer, { ...this.settings.aurora, halfFloat: this.halfFloat });
      u.tAurora.value = this.aurora.texture;
      if (this.frameCount % this.settings.aurora.every === 0) this.aurora.render(this.clock.elapsed);
    }
    this.frameCount++;
    // Fully on paper, the scene is invisible: just clear to bone. Set the
    // colour again first: three caches the GL clear colour from its last
    // render, and the pointer field's render target leaves it in linear.
    if (u.uPaper.value >= 0.999 || !u.tNoise.value) {
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(BONE, 1);
      this.renderer.clear();
      // Nothing of the world was drawn, whatever the pointer pass counted.
      this.renderer.info.reset();
    } else {
      this.renderer.render(this.scene, camera);
    }
    this.markDrawn();
    this.renderListeners.forEach((listener) => listener());
  }

  /**
   * Draw a newly built camp into one scissored pixel, before the frame's real
   * draw covers it: its buffers upload and its pipelines build now, at the
   * canvas's own format, rather than on the first frame it's revealed.
   */
  private drawWarm(camera: PerspectiveCamera) {
    const set = this.warm;
    this.warm = null;
    if (!set || set === this.shown || !this.built.has(set.id)) return;
    const current = this.shown?.group;
    set.group.visible = true;
    if (current) current.visible = false;
    this.renderer.setRenderTarget(null);
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, 1, 1);
    this.renderer.render(this.scene, camera);
    this.renderer.setScissorTest(false);
    set.group.visible = false;
    if (current) current.visible = true;
  }

  private applyPixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.dprCap));
  }

  // Moving the window to a screen with a different pixel ratio doesn't resize
  // the container, so watch the ratio itself.
  private watchPixelRatio() {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        this.applyPixelRatio();
        this.resize();
        this.watchPixelRatio();
      },
      { once: true, signal: this.listeners.signal },
    );
  }

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return; // still hidden while starting
    this.renderer.setSize(width, height, false);
    const size = this.renderer.getDrawingBufferSize(this.uniforms.uResolution.value);
    this.uniforms.uResolution.value.copy(size);
    this.pointer.clear();
    this.measureStage();
    this.wake();
  }
}
