import { Matrix4, Raycaster, REVISION, Vector2, Vector3, type InstancedMesh, type Mesh } from 'three';
import type { BiomeId } from '../data/biomes';
import type { WorldRoute } from './route';
import type { StationSpec } from './scene/biome-set';
import type { TerrainView } from './scene/terrain';
import type { Tier } from './systems/quality';
import type { Level, World } from './World';

export type WorldInfo = {
  tier: Tier;
  antialias: boolean;
  pixelRatio: number;
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  shown: BiomeId | null;
  limbo: number;
  paper: number;
  phase: string;
};

/** The handle Playwright and the debug panel use. Only dev and test builds expose it. */
export type WorldHook = {
  revision: string;
  /** Random per start. It only changes if the world starts again, which means a full page load. */
  instance: string;
  /** Resolves after the first frame. */
  ready: Promise<void>;
  route(): WorldRoute;
  info(): WorldInfo;
  /** Draw now, without advancing time. */
  render(): void;
  /** Advance n frames of 1/60 s (pointer history, springs), then draw. */
  step(frames: number): void;
  /** Draw, then read one pixel as RGBA. x and y are fractions of the canvas from its top left. */
  pixel(x: number, y: number): [number, number, number, number];
  /** Draw once, then read several pixels as RGBA (each [x, y] as for pixel). */
  pixels(points: [number, number][]): [number, number, number, number][];
  /** Draw, then return the canvas as a PNG data URL. */
  capture(): string;
  /** Mean saturation (HSV) over a grid of pixels, after a draw. */
  saturation(): number;
  /** Freeze scene time at the given seconds and redraw. */
  setTime(seconds: number): void;
  time(): number;
  view(name: TerrainView): void;
  cloudView(name: 'density' | 'pointer' | 'off'): void;
  /** The sea's debug channels: its crest metric, true depth and Fresnel. */
  seaView(name: 'crest' | 'depth' | 'fresnel' | 'off'): void;
  /** Resolves when the biome's set is built and compiled. */
  prepare(biome: BiomeId): Promise<void>;
  /** Camps built so far (prefetched or shown). */
  built(): BiomeId[];
  /** Delay every camp build that starts from now on, in ms. */
  slowPrepare(ms: number): void;
  /** Recent frame times in ms. */
  frameTimes(): number[];
  /** The shared uniform bag, for tuning from the console. */
  uniforms: Record<string, { value: unknown }>;
  /** Ground height of the shown camp's terrain at (x, z), in metres. */
  heightAt(x: number, z: number): number;
  /** Reframe the shown camp's landscape (position and target relative to its pad, vertical FOV), then draw. */
  station(spec: StationSpec): void;
  /** Where the visitor is in the camp, once any move has finished. */
  level(): Level | null;
  /** The landscape's zoom toward the camp, 0 to 1. */
  zoom(): number;
  /** The orbit's current angles at the campsite. */
  orbit(): { yaw: number; pitch: number; distance: number };
  /**
   * Screen positions (client pixels) of what can be pointed at on this level,
   * by id: their hotspots' spots, or `drop` metres below them (on the thing
   * itself, clear of its hotspot).
   */
  anchors(drop?: number): Record<string, { x: number; y: number; behind: boolean }>;
  /** The landscape marker's spot on screen. */
  campPoint(): { x: number; y: number; behind: boolean } | null;
  /** How much of the frame the dive's cloud fills, 0 to 1. */
  fly(): number;
  /** The camera is still on its way somewhere: a transition, a flight (into the tent, say), or easing to rest. */
  moving(): boolean;
  /** Keep the landscape's camera from following the pointer (it eases back to centre), so a sweep moves only what the cursor touches. */
  holdLook(on: boolean): void;
  /** Whether something in the scene, by name (the 'dog', the 'foreground-clouds'), is being drawn. */
  shows(name: string): boolean;
  /**
   * The shown camp's maples against the terrain as drawn (raycast onto its
   * mesh, not the height field): each tree's base, its height, and how far
   * the base stands above the lowest ground around its trunk's flare. The
   * stems start 0.15 m (scaled) below the base, so more than that floats.
   */
  roots(): { x: number; z: number; height: number; gap: number }[];
  /** How high above the ground at (x, z) the maple's leaves first cover it (raycast straight up), or null if open sky. */
  cover(x: number, z: number): number | null;
  director: {
    phase(): string;
    /** Stop the timeline moving on its own (tests seek it instead). */
    manual(on: boolean): void;
    /** Jump the running transition to `seconds` and draw it there. */
    seek(seconds: number): void;
  };
};

declare global {
  interface Window {
    __world?: WorldHook;
  }
}

export function exposeWorld(world: World): WorldHook {
  const { renderer } = world;
  const read = () => {
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { px, w, h };
  };
  const hook: WorldHook = {
    revision: REVISION,
    instance: Math.random().toString(36).slice(2),
    ready: world.firstFrame,
    route: () => world.route,
    info: () => {
      const size = renderer.getDrawingBufferSize(new Vector2());
      return {
        tier: world.quality.tier,
        antialias: world.quality.antialias,
        pixelRatio: renderer.getPixelRatio(),
        width: size.x,
        height: size.y,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        shown: world.shownBiome,
        limbo: world.director.limbo,
        paper: world.director.paper,
        phase: world.director.phase,
      };
    },
    render: () => world.render(),
    step: (frames) => world.step(frames),
    pixel: (x, y) => {
      // The drawing buffer isn't preserved, so read it in the same task as the draw.
      world.render();
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const column = Math.round(x * (gl.drawingBufferWidth - 1));
      const row = Math.round((1 - y) * (gl.drawingBufferHeight - 1));
      gl.readPixels(column, row, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2], px[3]];
    },
    pixels: (points) => {
      world.render();
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      return points.map(([x, y]) => {
        gl.readPixels(Math.round(x * (gl.drawingBufferWidth - 1)), Math.round((1 - y) * (gl.drawingBufferHeight - 1)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return [px[0], px[1], px[2], px[3]] as [number, number, number, number];
      });
    },
    capture: () => {
      world.render();
      return renderer.domElement.toDataURL('image/png');
    },
    saturation: () => {
      world.render();
      const { px, w, h } = read();
      let sum = 0;
      let n = 0;
      for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 48))) {
        for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 64))) {
          const i = (y * w + x) * 4;
          const max = Math.max(px[i], px[i + 1], px[i + 2]);
          const min = Math.min(px[i], px[i + 1], px[i + 2]);
          sum += max === 0 ? 0 : (max - min) / max;
          n++;
        }
      }
      return sum / Math.max(1, n);
    },
    setTime: (seconds) => {
      world.clock.freeze(seconds);
      world.uniforms.uTime.value = seconds;
      world.render();
    },
    time: () => world.clock.elapsed,
    view: (name) => world.setView(name),
    cloudView: (name) => world.setCloudView(name),
    seaView: (name) => world.setSeaView(name),
    prepare: (biome) => world.prefetch(biome),
    built: () => world.builtBiomes,
    slowPrepare: (ms) => {
      world.prepareDelay = ms;
    },
    frameTimes: () => [...world.frameTimes],
    uniforms: world.uniforms as unknown as Record<string, { value: unknown }>,
    heightAt: (x, z) => world.heightAt(x, z),
    station: (spec) => {
      world.setStation(spec);
      world.step(1);
    },
    level: () => world.level,
    zoom: () => world.rig.zoom,
    orbit: () => world.rig.orbitAngles,
    anchors: (drop = 0) =>
      Object.fromEntries(world.pickables.map((p) => [p.id, world.toScreen(p.anchor.clone().setY(p.anchor.y - drop))])),
    campPoint: () => {
      const point = world.campPoint;
      return point ? world.toScreen(point) : null;
    },
    fly: () => world.director.fly,
    moving: () => world.director.active || world.rig.settling,
    holdLook: (on) => {
      world.lookHeld = on;
    },
    shows: (name) => {
      let object = world.scene.getObjectByName(name);
      if (!object) return false;
      for (; object; object = object.parent ?? undefined) if (!object.visible) return false;
      return true;
    },
    roots: () => {
      const biome = world.scene.getObjectByName(`biome-${world.shownBiome}`);
      const terrain = biome?.getObjectByName('terrain');
      if (!biome || !terrain) return [];
      biome.updateMatrixWorld(true);
      const ray = new Raycaster();
      const down = new Vector3(0, -1, 0);
      const m = new Matrix4();
      const base = new Vector3();
      const scale = new Vector3();
      const roots: { x: number; z: number; height: number; gap: number }[] = [];
      biome.traverse((object) => {
        if (object.name !== 'maple-bark') return;
        const mesh = object as Mesh | InstancedMesh;
        const instanced = (mesh as InstancedMesh).isInstancedMesh;
        mesh.geometry.computeBoundingBox();
        // The trunk's footprint: how far its bark spreads at the ground (its flare), in its own space; not a bough sweeping low further out.
        const position = mesh.geometry.getAttribute('position');
        let foot = 0;
        for (let k = 0; k < position.count; k++) {
          const out = Math.hypot(position.getX(k), position.getZ(k));
          if (position.getY(k) < 0.2 && out < 4) foot = Math.max(foot, out);
        }
        for (let i = 0; i < (instanced ? (mesh as InstancedMesh).count : 1); i++) {
          if (instanced) {
            (mesh as InstancedMesh).getMatrixAt(i, m);
            m.premultiply(mesh.matrixWorld);
          } else m.copy(mesh.matrixWorld);
          base.setFromMatrixPosition(m);
          scale.setFromMatrixScale(m);
          let lowest = Infinity;
          for (let k = 0; k <= 8; k++) {
            const r = k === 8 ? 0 : foot * scale.x;
            ray.set(new Vector3(base.x + Math.cos(k * 0.785) * r, base.y + 500, base.z + Math.sin(k * 0.785) * r), down);
            const hit = ray.intersectObject(terrain, false)[0];
            if (hit) lowest = Math.min(lowest, hit.point.y);
          }
          roots.push({ x: base.x, z: base.z, height: mesh.geometry.boundingBox!.max.y * scale.y, gap: base.y - 0.15 * scale.y - lowest });
        }
      });
      return roots;
    },
    cover: (x, z) => {
      const biome = world.scene.getObjectByName(`biome-${world.shownBiome}`);
      if (!biome) return null;
      biome.updateMatrixWorld(true);
      const leaves: Mesh[] = [];
      biome.traverse((object) => {
        if (object.name === 'maple-leaves') leaves.push(object as Mesh);
      });
      const ground = world.heightAt(x, z);
      const hit = new Raycaster(new Vector3(x, ground + 0.1, z), new Vector3(0, 1, 0)).intersectObjects(leaves, false)[0];
      return hit ? hit.point.y - ground : null;
    },
    director: {
      phase: () => world.director.phase,
      manual: (on) => {
        world.director.manual = on;
      },
      seek: (seconds) => {
        world.director.seek(seconds);
        // One zero-time step so the rig takes the Director's pose before the draw.
        world.step(1);
      },
    },
  };
  window.__world = hook;
  return hook;
}
