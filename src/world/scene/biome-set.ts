// Everything one camp needs in the scene: its terrain tile, the heightmap the
// clouds fade against, the camp, its own dressing (Kevin's frozen lake and
// spruces, Mikey's sea) and the camera station. Built lazily, kept warm, and
// swapped while the screen is in limbo.
import {
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DataUtils,
  HalfFloatType,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  RedFormat,
  ShaderMaterial,
  Float32BufferAttribute,
  Vector3,
  Vector4,
  type BufferGeometry,
  type MeshStandardMaterial,
  type PerspectiveCamera,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BiomeId } from '../../data/biomes';
import type { OrbitSpec, Station } from '../camera/rig';
import { WORLD_ALL } from '../shaders/chunks';
import { createSimplex2D } from '../systems/noise';
import { createRandom } from '../systems/random';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';
import { PRESETS } from './biomes';
import { createCamp, type CampLayout } from './camp';
import { createDuneGrass } from './dune-grass';
import { createFallingLeaves, createLeafCarpet } from './leaf-fall';
import { createMaple } from './maples';
import { createSea } from './sea';
import { createPropMaterial } from './props-material';
import { requestTile } from './terrain-client';
import { surfaceOf } from './terrain-tile';
import { terrainFor, type HeightField, type TerrainSpec } from './terrain-fields';
import { createTerrainMesh } from './terrain';

type V3 = [number, number, number];

/**
 * Where everything goes, relative to the camp pad: the tent (in each person's
 * tone), the fire, the person between them, their pack, stove and water, a
 * camp chair facing the fire, and a dog, for a camp that has one.
 */
const LAYOUTS: Record<BiomeId, CampLayout> = {
  'alpine-aurora': {
    tent: { x: -1.6, z: -0.8, rotation: 0.25, colour: '#4f7a52' }, fire: { x: 2.0, z: 1.4 },
    person: { x: 0.55, z: 1.1, rotation: 0.4, jacket: '#2f5e44' }, pack: { x: -0.35, z: 0.55, rotation: -0.3 },
    stove: { x: 2.9, z: 0.45 }, water: { x: 3.15, z: 0.75 }, dog: { x: 0.95, z: 2.2, rotation: 1.45 }, boulders: 12,
    chair: { x: 1.1, z: 0.3, rotation: 0.69 },
  },
  'maple-autumn': {
    tent: { x: -1.8, z: -0.6, rotation: 0.3, colour: '#c99a2e' }, fire: { x: 2.0, z: 1.6 },
    person: { x: 0.45, z: 1.2, rotation: 0.35, jacket: '#8a5a1e' }, pack: { x: -0.5, z: 0.75, rotation: -0.2 },
    stove: { x: 2.9, z: 0.7 }, water: { x: 3.2, z: 1.0 }, dog: { x: 0.7, z: 2.45, rotation: 1.45 }, boulders: 5,
    chair: { x: 3.25, z: 1.95, rotation: -1.35 },
  },
  // Mikey's: the car side-on to the view, the tent pitched beside it, and Mikey between them.
  'coast-sunset': {
    tent: { x: -1.6, z: -2.4, rotation: 0.35, colour: '#b4473a' }, fire: { x: 1.6, z: 1.8 },
    person: { x: -2.7, z: -0.4, rotation: 0.5, jacket: '#7c2f2a' }, pack: { x: -1.5, z: 0.3, rotation: -0.25 },
    car: { x: -6.2, z: -2.6, rotation: 1.3 },
    stove: { x: 2.5, z: 0.9 }, water: { x: 2.8, z: 1.2 }, dog: { x: 0.85, z: 2.2, rotation: 1.2 }, boulders: 3,
    chair: { x: 0.6, z: 0.8, rotation: 0.79 },
  },
  'rockies-night': {
    tent: { x: -2.0, z: -1.0, rotation: -0.2, colour: '#3d6f9e' }, fire: { x: 1.8, z: 1.5 },
    person: { x: 0.3, z: 1.0, rotation: 0.25, jacket: '#24476b' }, pack: { x: -0.8, z: 0.45, rotation: 0.2 },
    stove: { x: 2.7, z: 0.6 }, water: { x: 3.0, z: 0.9 }, dog: { x: 1.0, z: 1.85, rotation: 1.2 }, boulders: 6,
    chair: { x: 0.9, z: 0.4, rotation: 0.69 },
  },
};

type PoseSpec = { position: V3; target: V3; fov: number };
/** Relative to the camp pad. `portrait` frames tall screens, where the stage sits above the panel. */
export type StationSpec = PoseSpec & { portrait?: PoseSpec };
type OrbitData = { centre: V3; yaw: number; pitch: number; distance: number; fov: number; near: number; far: number };

/**
 * Each camp's cameras, relative to its pad:
 *  - landscape: the camp in its setting, from high and far enough to see the
 *    land around it (the person page opens here);
 *  - approach: where scrolling on the landscape zooms toward, before diving;
 *  - orbit: the campsite close up, about 13 m out, which you can drag around.
 */
const CAMERAS: Record<BiomeId, { landscape: StationSpec; approach: StationSpec; orbit: OrbitData }> = {
  'alpine-aurora': {
    landscape: {
      position: [380, 360, 700], target: [-220, -260, -1500], fov: 52,
      portrait: { position: [440, 430, 820], target: [-220, -240, -1500], fov: 60 },
    },
    approach: { position: [120, 110, 215], target: [-70, -60, -420], fov: 52 },
    orbit: { centre: [0.2, 0.9, 0.2], yaw: 0.2, pitch: 0.3, distance: 13, fov: 48, near: 4.5, far: 36 },
  },
  'maple-autumn': {
    landscape: {
      position: [-180, 280, 620], target: [60, -60, -1000], fov: 50,
      portrait: { position: [-210, 330, 730], target: [60, -60, -1000], fov: 58 },
    },
    approach: { position: [-55, 90, 200], target: [10, -10, -340], fov: 50 },
    orbit: { centre: [0.1, 0.9, 0.4], yaw: -0.15, pitch: 0.24, distance: 12, fov: 48, near: 4.5, far: 34 },
  },
  'coast-sunset': {
    landscape: {
      position: [-240, 200, 560], target: [120, -20, -1100], fov: 50,
      portrait: { position: [-280, 240, 660], target: [120, -20, -1100], fov: 58 },
    },
    approach: { position: [-70, 65, 180], target: [20, 0, -330], fov: 50 },
    orbit: { centre: [-0.2, 0.9, 0.5], yaw: -0.3, pitch: 0.2, distance: 12, fov: 48, near: 4.5, far: 34 },
  },
  'rockies-night': {
    landscape: {
      position: [200, 430, 780], target: [-80, -120, -1300], fov: 50,
      portrait: { position: [230, 520, 920], target: [-80, -100, -1300], fov: 58 },
    },
    approach: { position: [70, 130, 250], target: [-20, -30, -420], fov: 50 },
    orbit: { centre: [-0.2, 0.9, 0.1], yaw: -0.2, pitch: 0.24, distance: 13, fov: 48, near: 4.5, far: 36 },
  },
};

const poseFrom = (s: PoseSpec, ground: number) => ({
  position: new Vector3(s.position[0], ground + s.position[1], s.position[2]),
  target: new Vector3(s.target[0], ground + s.target[1], s.target[2]),
  fov: s.fov,
});

/** A station from its spec, which is relative to the camp pad's ground height. */
export function stationFrom(s: StationSpec, ground: number): Station {
  return { ...poseFrom(s, ground), portrait: s.portrait && poseFrom(s.portrait, ground) };
}

/** A biome's cameras, from data alone, so the Director can plan a path before the set is built. */
/**
 * Where the camp sits in the landscape's own (unshifted) frame, from its top: the middle.
 * The page then shifts the frame (World.measureStage), so on screen it sits a little below
 * the middle, well clear of the bottom edge, with the sky composed above it.
 */
const CAMP_IN_FRAME = 0.5;

/**
 * Lower (or raise) a pose, keeping the way it looks, so `point` sits `at` of
 * the frame's height from its top (with the frame centred). Moving the camera
 * rather than tipping it keeps each landscape's horizon, and its sky, where it
 * was composed; the camp comes up the frame instead. Every landscape is placed
 * this way, so its camp is on screen whatever the window's shape. It never
 * goes within `clearance` of the ground below it.
 */
function seat(pose: { position: Vector3; target: Vector3; fov: number }, point: Vector3, at: number, ground: HeightField, clearance = 25) {
  const forward = pose.target.clone().sub(pose.position).normalize();
  const look = Math.asin(forward.y);
  const below = Math.atan((at - 0.5) * 2 * Math.tan((pose.fov * Math.PI) / 360));
  const across = Math.hypot(point.x - pose.position.x, point.z - pose.position.z);
  const height = Math.max(point.y + across * Math.tan(below - look), ground(pose.position.x, pose.position.z) + clearance);
  const lift = height - pose.position.y;
  pose.position.y += lift;
  pose.target.y += lift;
}

/** A station, placed so its camp sits where it should in the frame (and its portrait variant too). */
function seatedStation(s: StationSpec, ground: number, camp: Vector3, height: HeightField): Station {
  const station = stationFrom(s, ground);
  seat(station, camp, CAMP_IN_FRAME, height);
  if (station.portrait) seat(station.portrait, camp, CAMP_IN_FRAME, height);
  return station;
}

export function camerasFor(id: BiomeId, spec: TerrainSpec): { landscape: Station; approach: Station; orbit: OrbitSpec } {
  const c = CAMERAS[id];
  const o = c.orbit;
  // The camp's marker: above the fire.
  const camp = new Vector3(LAYOUTS[id].fire.x, spec.camp + 1.5, LAYOUTS[id].fire.z);
  return {
    landscape: seatedStation(c.landscape, spec.camp, camp, spec.height),
    approach: seatedStation(c.approach, spec.camp, camp, spec.height),
    orbit: {
      centre: new Vector3(o.centre[0], spec.camp + o.centre[1], o.centre[2]),
      yaw: o.yaw,
      pitch: o.pitch,
      distance: o.distance,
      fov: o.fov,
      near: o.near,
      far: o.far,
      minPitch: 0.06,
      maxPitch: 1.0,
      ground: spec.height,
    },
  };
}

export type BiomeSetContext = {
  uniforms: WorldUniforms;
  terrainMaterial: MeshStandardMaterial;
  starLayers: number;
  resolution: number;
  puffs: number;
  trees: number;
  /** The land's seed: fixed, since each camp's cameras are framed on its land. */
  seed: number;
  /** The seed for what's planted (trees, leaves, grass): ?seed= sweeps it without moving the land. */
  plants: number;
};

export type BiomeSet = Awaited<ReturnType<typeof buildBiomeSet>>;

export async function buildBiomeSet(id: BiomeId, ctx: BiomeSetContext) {
  const spec = terrainFor(id, ctx.seed);
  const radius = 5000;
  const power = 1.6;
  const tile = await requestTile({ biome: id, seed: ctx.seed, resolution: ctx.resolution, radius, power });
  // The ground as drawn, for planting trees on (the height field runs above it over rises, between the grid's vertices).
  const ground = surfaceOf(tile, power);
  const group = new Object3D();
  group.name = `biome-${id}`;
  group.visible = false;
  group.add(createTerrainMesh(tile, ctx.terrainMaterial));

  const halves = new Uint16Array(tile.heightmap.length);
  for (let i = 0; i < halves.length; i++) halves[i] = DataUtils.toHalfFloat(tile.heightmap[i]);
  const heightTexture = new DataTexture(halves, tile.heightmapSize, tile.heightmapSize, RedFormat, HalfFloatType);
  heightTexture.minFilter = LinearFilter;
  heightTexture.magFilter = LinearFilter;
  heightTexture.needsUpdate = true;
  const heightBounds = new Vector4(-radius, -radius, radius * 2, 0);

  const camp = createCamp(ctx.uniforms, ctx.starLayers, LAYOUTS[id], spec.height, ctx.seed + 3);
  group.add(camp.group);

  const disposers: (() => void)[] = [() => camp.dispose()];
  const updaters: ((camera: PerspectiveCamera) => void)[] = [];
  if (id === 'rockies-night') {
    const lake = createIce(ctx.uniforms, ctx.starLayers, spec);
    group.add(lake.mesh);
    disposers.push(lake.dispose);
    const trees = createSpruces(ctx.uniforms, ctx.starLayers, spec, ground, ctx.trees, ctx.plants + 7);
    group.add(trees.mesh);
    disposers.push(trees.dispose);
  }
  if (id === 'maple-autumn') {
    // One giant Japanese maple over the camp, the valley's only one, and a few evergreens further off.
    const maple = createMaple(ctx.uniforms, ctx.starLayers, spec, ground, { seed: ctx.plants + 11, camp: { x: 0, z: 0 } });
    group.add(maple.group);
    disposers.push(maple.dispose);
    const evergreens = createSpruces(ctx.uniforms, ctx.starLayers, spec, ground, Math.round(ctx.trees / 28), ctx.plants + 7);
    group.add(evergreens.mesh);
    disposers.push(evergreens.dispose);
    // The tent on a carpet of leaves, and more coming down.
    const layout = LAYOUTS[id];
    const keepout = [{ x: layout.fire.x, z: layout.fire.z, r: 1.1 }, { x: layout.tent.x, z: layout.tent.z, r: 1.5 }];
    const carpet = createLeafCarpet(ctx.uniforms, ctx.starLayers, spec.height, Math.round(ctx.trees / 2), ctx.plants + 13, keepout);
    group.add(carpet.mesh);
    disposers.push(carpet.dispose);
    const falling = createFallingLeaves(ctx.uniforms, ctx.starLayers, spec.camp, Math.round(ctx.trees / 13), ctx.plants + 17);
    group.add(falling.mesh);
    disposers.push(falling.dispose);
  }
  if (id === 'coast-sunset') {
    const sea = createSea(ctx.uniforms, ctx.starLayers);
    group.add(sea.mesh);
    updaters.push((camera) => sea.mesh.position.set(camera.position.x, 0, camera.position.z));
    disposers.push(sea.dispose);
    const grass = createDuneGrass(ctx.uniforms, ctx.starLayers, spec, Math.round(ctx.trees * 1.2), ctx.plants + 19);
    group.add(grass.mesh);
    disposers.push(grass.dispose);
  }

  const cameras = camerasFor(id, spec);

  return {
    id,
    group,
    spec,
    cameras,
    heightTexture,
    heightBounds,
    puffs: scatterPuffs(id, spec, ctx.puffs, ctx.seed + 9),
    puffSize: PUFFS[id].size,
    camp,
    update(camera: PerspectiveCamera) {
      updaters.forEach((update) => update(camera));
    },
    dispose() {
      group.traverse((o) => {
        if (o.name === 'terrain') (o as Mesh).geometry.dispose();
      });
      heightTexture.dispose();
      disposers.forEach((dispose) => dispose());
    },
  };
}

/**
 * Each camp's puffs: how far out they drift ([near, far] in the sector ahead,
 * then the ring around), their width and height above the cloud layer's top
 * in metres, and the clearance they keep above the ground. Harry's are fog
 * banks on the cloud sea; Kevin's are wisps of mist on the ice.
 */
type PuffSpec = { ahead: [number, number]; ring: [number, number]; size: [number, number]; lift: [number, number]; clear: number };
const PUFFS: Record<BiomeId, PuffSpec> = {
  'alpine-aurora': { ahead: [900, 4500], ring: [1400, 6600], size: [260, 640], lift: [-20, 50], clear: 30 },
  'rockies-night': { ahead: [60, 700], ring: [200, 900], size: [40, 110], lift: [6, 30], clear: 2 },
  // Caleb's: low mist lying in the valley, well below the cloud layer.
  'maple-autumn': { ahead: [250, 2600], ring: [500, 3800], size: [90, 240], lift: [-1060, -1020], clear: 12 },
  'coast-sunset': { ahead: [600, 4000], ring: [1400, 6600], size: [260, 640], lift: [-20, 50], clear: 30 },
};

function scatterPuffs(id: BiomeId, spec: TerrainSpec, count: number, seed: number) {
  const random = createRandom(seed);
  const range = PUFFS[id];
  const altitude = PRESETS[id].cloudHeight + PRESETS[id].cloudThickness / 2;
  const data = new Float32Array(count * 4);
  const ahead = Math.round(count * 0.7);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 30; tries++) {
    // Most in the sector the camera looks into (north, -z), the rest ringing
    // the camp for the transitions; stratified by angle so they don't clump.
    const inAhead = n < ahead;
    const a = inAhead
      ? -Math.PI / 2 + (((n + random()) / ahead) * 2 - 1) * 1.2
      : ((n - ahead + random()) / Math.max(1, count - ahead)) * Math.PI * 2;
    const [near, far] = inAhead ? range.ahead : range.ring;
    const r = near + random() * (far - near);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const lift = range.lift[0] + random() * (range.lift[1] - range.lift[0]);
    // Only where it floats clear of the ground: over the cloud sea, or the ice.
    if (spec.height(x, z) > altitude + lift - range.clear) continue;
    data.set([x, lift, z, random()], n * 4);
    n++;
  }
  return data.slice(0, n * 4);
}

// ---------------------------------------------------------------- Kevin's lake

const ICE_KEYS = [...SKY_KEYS, 'uSnowColor', 'uAmbient', 'uKeyColor'] as const;

function createIce(uniforms: WorldUniforms, starLayers: number, spec: TerrainSpec) {
  const material = new ShaderMaterial({
    name: 'world-ice',
    uniforms: pickUniforms(uniforms, ICE_KEYS),
    defines: { STAR_LAYERS: starLayers },
    vertexShader: 'varying vec3 vWorldPos; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorldPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      ${WORLD_ALL}
      uniform vec3 uSnowColor;
      uniform vec3 uAmbient;
      uniform vec3 uKeyColor;
      varying vec3 vWorldPos;
      void main() {
        vec2 xz = vWorldPos.xz;
        // Wind-blown snow lies in long drifts across the ice, with scoured black
        // ice between: noise stretched along the wind, and bent a little so the
        // streaks aren't ruled lines. Wider than the lake along the wind, so the
        // noise texture's tiling never shows.
        vec2 wd = normalize(uWind);
        vec2 p = vec2(dot(xz, wd), dot(xz, vec2(-wd.y, wd.x)));
        vec4 warp = texture(tNoise, xz / 900.0 + 0.37);
        vec2 q = p + (warp.rg - 0.5) * vec2(60.0, 24.0);
        vec4 broad = texture(tNoise, vec2(q.x / 640.0, q.y / 90.0));
        vec4 fine = texture(tNoise, vec2(q.x / 170.0, q.y / 26.0) + 0.21);
        float crack = smoothstep(0.86, 0.97, texture(tNoise, q / 61.0 + 0.53).b) * (0.5 + 0.5 * fine.g);
        vec3 N = normalize(vec3((broad.b - 0.5) * 0.04 + crack * 0.05, 1.0, (fine.r - 0.5) * 0.04));
        vec3 V = normalize(vWorldPos - cameraPosition);
        vec3 R = reflect(V, N);
        float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        // The sky reflected analytically, stars included: no reflection pass.
        vec3 reflection = wSky(R, uPixelAngle * 2.0);
        vec3 col = mix(vec3(0.004, 0.008, 0.014), reflection, fresnel * 0.9);
        col += vec3(0.02, 0.05, 0.07) * crack * (uAmbient + uKeyColor);
        float snow = smoothstep(0.36, 0.64, broad.r * 0.7 + fine.g * 0.4 - 0.03);
        vec3 snowLit = uSnowColor * (uAmbient + uKeyColor * max(dot(vec3(0.0, 1.0, 0.0), uKeyDir), 0.0));
        col = mix(col, snowLit, snow * 0.82);
        col = wCloudFog(wHaze(col, vWorldPos), vWorldPos);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        gl_FragColor.rgb = wGrade(gl_FragColor.rgb);
        #include <colorspace_fragment>
      }
    `,
  });
  const lake = spec.lake ?? { x: 0, z: 0, radius: 1 };
  const mesh = new Mesh(new CircleGeometry(lake.radius, 96).rotateX(-Math.PI / 2), material);
  mesh.name = 'ice';
  mesh.position.set(lake.x, (spec.water ?? 0) + 0.05, lake.z);
  return {
    mesh,
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------- Kevin's spruces

/** A placeholder spruce: a trunk and drooping whorls, coloured by vertex. */
function spruceGeometry(seed: number) {
  const random = createRandom(seed);
  const parts: BufferGeometry[] = [];
  const paint = (geometry: BufferGeometry, rgb: V3) => {
    const count = geometry.getAttribute('position').count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set(rgb, i * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
    return geometry;
  };
  parts.push(paint(new CylinderGeometry(0.12, 0.26, 10, 6).translate(0, 5, 0), [0.11, 0.08, 0.06]));
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 2.5 * (1 - t) + 0.45;
    const h = 2.6 - t * 1.1;
    const y = 1.6 + t * 8.2;
    const cone = new ConeGeometry(r, h, 9, 1, true);
    const position = cone.getAttribute('position');
    // Ragged, drooping branch tips.
    for (let k = 0; k < position.count; k++) {
      const x = position.getX(k);
      const z = position.getZ(k);
      const rim = Math.hypot(x, z) / r;
      if (rim > 0.9) {
        const jag = 0.85 + random() * 0.3;
        position.setXYZ(k, x * jag, position.getY(k) - 0.25 * rim, z * jag);
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, y, 0);
    const shade = 0.85 + random() * 0.3;
    parts.push(paint(cone, [0.05 * shade, 0.1 * shade, 0.07 * shade]));
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Spruces, placed by the height field and planted on `ground` (the terrain as drawn). */
function createSpruces(uniforms: WorldUniforms, starLayers: number, spec: TerrainSpec, ground: HeightField, count: number, seed: number) {
  const geometry = spruceGeometry(seed);
  const material = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.95, snow: true });
  material.vertexColors = true;
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
  mesh.name = 'spruces';
  const random = createRandom(seed + 1);
  const density = createSimplex2D(seed + 2);
  const lake = spec.water ?? 0;
  const m = new Matrix4();
  const q = new Quaternion();
  // Mostly in a band around the lake and up the lower slopes, in clumps.
  const centre = spec.lake ?? { x: 0, z: 0, radius: 20 };
  let placed = 0;
  for (let tries = 0; tries < count * 15 && placed < count; tries++) {
    const a = random() * Math.PI * 2;
    const r = centre.radius + 10 + random() ** 1.6 * 1100;
    const x = centre.x + Math.cos(a) * r;
    const z = centre.z + Math.sin(a) * r;
    if (Math.hypot(x, z) < 40) continue; // the camp
    if (z > 20 && Math.abs(x) < 30) continue; // keep the view from the station open
    const h = spec.height(x, z);
    if (h > lake + 430) continue; // treeline
    const slope = Math.hypot(spec.height(x + 3, z) - spec.height(x - 3, z), spec.height(x, z + 3) - spec.height(x, z - 3)) / 6;
    if (slope > 0.75) continue;
    if (density(x / 140, z / 140) + random() * 0.6 < 0.2) continue; // clumps and clearings
    const s = 0.65 + random() * 0.8;
    q.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
    m.compose(new Vector3(x, ground(x, z) - 0.4, z), q, new Vector3(s, s * (0.9 + random() * 0.3), s));
    mesh.setMatrixAt(placed++, m);
  }
  mesh.count = placed;
  mesh.computeBoundingSphere();
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
