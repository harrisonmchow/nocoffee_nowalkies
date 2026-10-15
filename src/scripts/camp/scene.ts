// The /camp scene: a big misty mountain with our camp on the summit.
// Three levels, each a zoom deeper:
//   mountain  the whole peak, mist round its foot
//   camp      life-size on a shelf levelled into the summit
//   tent      the tent fades away to show the sleeping gear
// Zoom in far enough (or flick hard) on the mountain to dive to the camp;
// zoom out far enough at camp to fly back. Everything that differs
// between mountains comes from its config in data/mountains.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { camp, type GearItem } from '../../data/camp';
import type { MountainConfig } from '../../data/mountains';
import { installHeightFog, makeMist } from './mist';
import { makeStandIn } from './props';
import { makeRock, rng } from './rocks';

export type Mode = 'mountain' | 'camp' | 'tent';

const SKY = new THREE.Color('#dcd9d2');

// Camp layout in metres around the shelf centre. Tent door faces +z.
type Fit = { by: 'height' | 'width'; size: number };
type Spot = { x: number; z: number; rot: number; fit?: Fit };
const layout: Record<string, Spot> = {
  tent: { x: -1.9, z: -1.3, rot: 0.35, fit: { by: 'width', size: 2.6 } },
  fire: { x: 1.3, z: 1.0, rot: 0, fit: { by: 'width', size: 0.9 } },
  chair: { x: 2.5, z: 0.1, rot: -2.1, fit: { by: 'height', size: 0.95 } },
  person: { x: 2.1, z: 2.2, rot: -2.4, fit: { by: 'height', size: 1.75 } },
  clothes: { x: -1.4, z: 2.0, rot: 0.2 },
};
// Sleeping gear in the tent's own frame, spread wider than a real tent.
const inside: Record<string, { x: number; z: number; rot: number }> = {
  mat: { x: -0.4, z: 0.05, rot: 0 },
  bag: { x: 0.42, z: 0.1, rot: 0 },
  pillow: { x: -0.4, z: -0.72, rot: 0.06 },
};

// Where the camera sits at each level: a target, a direction to look
// from (azimuth, polar), and a distance.
type View = { target: THREE.Vector3; az: number; polar: number; dist: number };
type Limits = { min: number; max: number; az: readonly [number, number]; polar: readonly [number, number] };
const LEAVE_AT = 40; // zooming out past this at camp flies back out

export type CampUI = {
  stage: HTMLElement;
  label: HTMLElement;
  back: HTMLButtonElement;
  backLabel: HTMLElement;
  summit: HTMLButtonElement;
  veil: HTMLElement;
  status: HTMLElement;
  onSelect: (item: GearItem | null) => void;
  onMode: (mode: Mode) => void;
};

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const dirFrom = (az: number, polar: number) =>
  new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));

export function initCamp(ui: CampUI, cfg: MountainConfig) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Everything registered here is removed again by dispose().
  const life = new AbortController();
  const on = { signal: life.signal };
  let disposed = false;

  // The levelled shelf, in world metres with the mountain's foot at y = 0.
  const shelf = new THREE.Vector3(cfg.shelf.x, cfg.shelf.y - cfg.baseY, cfg.shelf.z).multiplyScalar(cfg.scale);
  const centre = cfg.mist.centre === 'shelf' ? shelf : new THREE.Vector3();
  installHeightFog({
    bottom: cfg.mist.bottom,
    top: cfg.mist.top,
    floor: cfg.mist.floor,
    density: cfg.mist.density,
    radial: cfg.mist.radial && { centre: [centre.x, centre.z], fade: cfg.mist.radial },
    tile: cfg.mist.tile,
  });

  const cam = cfg.camera;
  const [ox, oz] = cam.targetOffset ?? [0, 0];
  const views = {
    mountain: { target: new THREE.Vector3(shelf.x + ox, cam.targetY, shelf.z + oz), az: cam.az, polar: cam.polar, dist: cam.dist },
    camp: { target: shelf.clone().add(new THREE.Vector3(0, 0.6, 0)), az: 0.35, polar: 1.12, dist: 14 },
  } satisfies Record<string, View>;
  const limits: Record<Mode, Limits> = {
    mountain: { min: cam.min, max: cam.max, az: cam.azRange, polar: cam.polarRange },
    camp: { min: 4, max: 42, az: cam.campAz ?? [-Infinity, Infinity], polar: [0.35, 1.45] },
    tent: { min: 2.5, max: 8, az: [-Infinity, Infinity], polar: [0.2, 1.3] },
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.className = 'camp-canvas';
  ui.stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, ...cfg.mist.distance);

  const camera = new THREE.PerspectiveCamera(34, 1, 1, 9000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = false;

  // Overcast light, one low warm sun for the camp's shadows.
  scene.add(new THREE.HemisphereLight('#eeebe4', '#6f6a62', 1.5));
  const sun = new THREE.DirectionalLight('#ffeedd', 1.8);
  sun.position.copy(shelf).add(new THREE.Vector3(30, 38, 24));
  sun.target.position.copy(shelf);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -11;
  sun.shadow.camera.right = sun.shadow.camera.top = 11;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Mist: drifting cloud bands, positioned around the mountain's centre.
  const mist = makeMist(
    SKY,
    cfg.mist.bands.map((b) => ({
      ...b,
      x: [centre.x + b.x[0], centre.x + b.x[1]] as [number, number],
      z: [centre.z + b.z[0], centre.z + b.z[1]] as [number, number],
    })),
  );
  scene.add(mist.group);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  // Gear bookkeeping (as on the island version).
  const roots = new Map<string, THREE.Group>();
  const mats = new Map<string, THREE.MeshStandardMaterial[]>();
  const mixers: THREE.AnimationMixer[] = [];
  const campGroup = new THREE.Group();
  campGroup.position.copy(shelf);
  scene.add(campGroup);
  const tentInside = new THREE.Group();
  tentInside.visible = false;
  campGroup.add(tentInside);
  const floor = new THREE.Mesh(
    new RoundedBoxGeometry(2.1, 0.02, 2.5, 2, 0.01),
    new THREE.MeshStandardMaterial({ color: '#cfc4ae', roughness: 1 }),
  );
  floor.receiveShadow = true;
  floor.position.y = 0.012;
  tentInside.add(floor);

  let terrain: THREE.Object3D | null = null;
  const down = new THREE.Raycaster();
  /** Ground height (camp-local) under a camp-local x/z. */
  function groundAt(x: number, z: number) {
    if (!terrain) return 0;
    down.set(new THREE.Vector3(shelf.x + x, shelf.y + 50, shelf.z + z), new THREE.Vector3(0, -1, 0));
    const hit = down.intersectObject(terrain, true)[0];
    return hit ? hit.point.y - shelf.y : 0;
  }

  async function loadMountain() {
    const gltf = await loader.loadAsync(cfg.model);
    if (disposed) return;
    const m = gltf.scene;
    m.scale.setScalar(cfg.scale);
    m.position.y = -cfg.baseY * cfg.scale;
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (cfg.tint) mat.color.set(cfg.tint);
      // Files with no roughness map render glossy; make them matte rock.
      if (cfg.matte) {
        mat.metalness = 0;
        mat.roughness = 1;
      }
    });
    scene.add(m);
    m.updateMatrixWorld(true);
    terrain = m;
  }

  function fit(obj: THREE.Object3D, f: Fit) {
    // Precise boxes measure skinned characters as posed, not as stored.
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj, true);
    const size = box.getSize(new THREE.Vector3());
    const now = f.by === 'height' ? size.y : Math.max(size.x, size.z);
    if (now > 0) obj.scale.multiplyScalar(f.size / now);
    obj.updateMatrixWorld(true);
    box.setFromObject(obj, true);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.x -= c.x;
    obj.position.z -= c.z;
    obj.position.y -= box.min.y;
  }

  function register(item: GearItem, root: THREE.Group) {
    const list: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      // Own copies so highlighting one thing never lights up another.
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
      for (const x of [m.material].flat()) if ('emissive' in x) list.push(x as THREE.MeshStandardMaterial);
    });
    root.userData.gear = item;
    mats.set(item.id, list);
    roots.set(item.id, root);
  }

  let fireLight: THREE.PointLight | null = null;
  let flame: THREE.Object3D | null = null;

  async function place(item: GearItem) {
    let obj: THREE.Object3D;
    if (item.model) {
      try {
        const gltf = await loader.loadAsync(item.model);
        if (disposed) return;
        obj = gltf.scene;
        // Some models ship invisible collision meshes; drop them.
        obj.getObjectsByProperty('isMesh', true)
          .filter((m) => /collid/i.test(m.name))
          .forEach((m) => m.removeFromParent());
        if (gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(obj);
          const clip = gltf.animations.find((a) => /idle|idol/i.test(a.name)) ?? gltf.animations[0];
          mixer.clipAction(clip).play();
          mixers.push(mixer);
        }
      } catch {
        obj = makeStandIn(item);
      }
    } else obj = makeStandIn(item);

    const root = new THREE.Group();
    const holder = new THREE.Group();
    holder.add(obj);
    root.add(holder);
    if (item.inside) {
      const s = inside[item.id];
      root.position.set(s.x, 0.02, s.z);
      root.rotation.y = s.rot;
      tentInside.add(root);
    } else {
      const s = layout[item.id];
      if (s.fit) fit(holder, s.fit);
      root.position.set(s.x, groundAt(s.x, s.z), s.z);
      root.rotation.y = s.rot;
      campGroup.add(root);
      if (item.id === 'tent') {
        tentInside.position.copy(root.position);
        tentInside.rotation.y = s.rot;
      }
      if (item.kind === 'fire') {
        fireLight = new THREE.PointLight('#ffb36b', 3, 6, 1.6);
        fireLight.position.set(0, 0.5, 0);
        root.add(fireLight);
        flame = root.getObjectByName('flame') ?? null;
      }
    }
    register(item, root);
  }

  function scatterRocks() {
    const r = rng(17);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2;
      const d = 5.5 + r() * 4;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const rock = makeRock(0.2 + r() * 0.5, 300 + i);
      rock.position.set(x, groundAt(x, z), z);
      campGroup.add(rock);
    }
  }

  ui.status.textContent = 'Loading the mountain…';
  loadMountain()
    .then(() => {
      if (disposed) return;
      ui.stage.classList.add('is-ready');
      ui.status.textContent = '';
      scatterRocks();
      return Promise.all(camp.map(place));
    })
    .catch(() => {
      if (!disposed) ui.status.textContent = 'The mountain didn’t load. Try refreshing.';
    });

  // Camera ----------------------------------------------------------
  let mode: Mode = 'mountain';

  function applyLimits(m: Mode) {
    const l = limits[m];
    controls.minDistance = l.min;
    controls.maxDistance = l.max;
    controls.minAzimuthAngle = l.az[0];
    controls.maxAzimuthAngle = l.az[1];
    controls.minPolarAngle = l.polar[0];
    controls.maxPolarAngle = l.polar[1];
  }

  function setView(v: View) {
    controls.target.copy(v.target);
    camera.position.copy(v.target).addScaledVector(dirFrom(v.az, v.polar), v.dist);
  }
  // Portrait screens frame the mountain differently (see camera.portrait).
  if (ui.stage.clientWidth / ui.stage.clientHeight < 0.8) views.mountain.dist *= cam.portrait;
  setView(views.mountain);
  applyLimits('mountain');

  // A move between two views. Distance changes in log space so a
  // thousand-metre dive and a ten-metre step feel the same speed.
  let trip: null | {
    t: number; dur: number;
    t0: THREE.Vector3; t1: THREE.Vector3;
    d0: THREE.Vector3; d1: THREE.Vector3;
    r0: number; r1: number;
    veil: boolean;
    done?: () => void;
  } = null;

  function travel(to: View | { target: THREE.Vector3; pos: THREE.Vector3 }, dur: number, veil = false, done?: () => void) {
    const t1 = to.target.clone();
    const p1 = 'pos' in to ? to.pos : to.target.clone().addScaledVector(dirFrom(to.az, to.polar), to.dist);
    const off1 = p1.clone().sub(t1);
    const off0 = camera.position.clone().sub(controls.target);
    controls.enabled = false;
    // Loosen the limits for the trip; the destination's apply on arrival.
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.minAzimuthAngle = controls.minPolarAngle = -Infinity;
    controls.maxAzimuthAngle = controls.maxPolarAngle = Infinity;
    trip = {
      t: reduce ? 1 : 0, dur,
      t0: controls.target.clone(), t1,
      d0: off0.clone().normalize(), d1: off1.clone().normalize(),
      r0: off0.length(), r1: off1.length(),
      veil, done,
    };
  }

  function stepTrip(dt: number) {
    if (!trip) return;
    trip.t = Math.min(1, trip.t + dt / trip.dur);
    const k = ease(trip.t);
    // On the long trips the look-at point must not slide through the
    // mountain's insides: going in it reaches the summit while the camera
    // is still far off; coming out it leaves the summit last.
    const tk = !trip.veil ? k : trip.r1 < trip.r0 ? ease(Math.min(1, trip.t / 0.5)) : ease(Math.max(0, (trip.t - 0.5) / 0.5));
    controls.target.lerpVectors(trip.t0, trip.t1, tk);
    // Arc up and over on long trips so the camera never cuts through rock.
    const lift = trip.veil ? Math.sin(Math.PI * k) * 1.2 : 0;
    const dir = trip.d0.clone().lerp(trip.d1, k).add(new THREE.Vector3(0, lift, 0)).normalize();
    const dist = Math.exp(THREE.MathUtils.lerp(Math.log(trip.r0), Math.log(trip.r1), k));
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    camera.lookAt(controls.target);
    // A light haze as the camera passes the cloud layer, never a cut:
    // the landing should stay visible the whole way down.
    const veil = Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp((k - 0.15) / 0.55, 0, 1)), 2);
    ui.veil.style.opacity = trip.veil ? String(veil * 0.35) : '0';
    if (trip.t >= 1) {
      const done = trip.done;
      trip = null;
      ui.veil.style.opacity = '0';
      controls.enabled = true;
      applyLimits(mode);
      done?.();
    }
  }

  function setMode(m: Mode) {
    mode = m;
    ui.back.hidden = m === 'mountain';
    ui.backLabel.textContent = m === 'tent' ? 'Back to camp' : 'Back to the mountain';
    ui.summit.hidden = m !== 'mountain';
    ui.onMode(m);
  }

  let queued: string | null = null;
  function dive() {
    if (mode !== 'mountain' || trip) return;
    setMode('camp');
    travel(views.camp, reduce ? 0.01 : 3.2, true, () => {
      if (queued) {
        const id = queued;
        queued = null;
        select(id);
      }
    });
  }

  function climbOut() {
    if (trip) return;
    if (mode === 'tent') leaveTent();
    select(null);
    setMode('mountain');
    travel(views.mountain, reduce ? 0.01 : 2.8, true);
  }

  // Zoom intent: past the threshold on the mountain dives, past the far
  // limit at camp climbs back out.
  controls.addEventListener('change', () => {
    if (trip || !controls.enabled) return;
    const d = controls.getDistance();
    if (mode === 'mountain' && d <= cam.diveAt) dive();
    else if (mode === 'camp' && d >= LEAVE_AT) climbOut();
  });
  // A hard flick of the wheel dives straight away, wherever you are.
  let flick = 0;
  let flickAt = 0;
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      const now = performance.now();
      if (now - flickAt > 250) flick = 0;
      flickAt = now;
      flick += e.deltaY;
      if (mode === 'mountain' && flick < -900) dive();
      else if (mode === 'camp' && flick > 900) climbOut();
    },
    { passive: true },
  );
  ui.summit.addEventListener('click', dive, on);
  ui.back.addEventListener('click', () => (mode === 'tent' ? leaveTent() : climbOut()), on);

  // Picking ---------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered: string | null = null;
  let selected: string | null = null;

  function pickable() {
    if (mode === 'mountain') return [];
    return [...roots.values()].filter((g) => (mode === 'tent') === !!(g.userData.gear as GearItem).inside);
  }

  function pick(clientX: number, clientY: number): string | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ptr.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickable(), true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.gear) o = o.parent;
    return o ? (o.userData.gear as GearItem).id : null;
  }

  function glow() {
    for (const [id, list] of mats) {
      const k = id === selected ? 0.07 : id === hovered ? 0.05 : 0;
      for (const m of list) m.emissive.setRGB(k, k * 0.95, k * 0.85);
    }
  }

  function showLabel(id: string | null, x = 0, y = 0) {
    if (!id) {
      ui.label.hidden = true;
      return;
    }
    const item = roots.get(id)!.userData.gear as GearItem;
    ui.label.textContent = item.id === 'tent' && mode === 'camp' ? 'Tent · click to open' : item.name;
    const rect = ui.stage.getBoundingClientRect();
    ui.label.style.transform = `translate(${x - rect.left + 14}px, ${y - rect.top + 14}px)`;
    ui.label.hidden = false;
  }

  const el = renderer.domElement;
  let press: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => (press = { x: e.clientX, y: e.clientY }));
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || trip) return;
    const id = pick(e.clientX, e.clientY);
    if (id !== hovered) {
      hovered = id;
      glow();
    }
    el.style.cursor = id ? 'pointer' : 'grab';
    showLabel(id, e.clientX, e.clientY);
  });
  el.addEventListener('pointerleave', () => {
    hovered = null;
    glow();
    showLabel(null);
  });
  el.addEventListener('pointerup', (e) => {
    if (!press || trip || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) return;
    const id = pick(e.clientX, e.clientY);
    if (id) select(id);
    else if (selected) select(null);
  });
  // Double-click the mountain to go up.
  el.addEventListener('dblclick', () => mode === 'mountain' && dive());

  // Tent ------------------------------------------------------------
  let openness = 0;
  let openGoal = 0;
  let campSaved: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  function setTentFade(k: number) {
    const tent = roots.get('tent');
    if (!tent) return;
    for (const m of mats.get('tent') ?? []) {
      m.transparent = k > 0;
      m.opacity = 1 - k * 0.92;
      m.depthWrite = k < 0.5;
    }
    tent.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = k < 0.5;
    });
    tent.scale.setScalar(1 + k * 0.35);
    tentInside.visible = k > 0.01;
    tentInside.scale.set(1, Math.max(k, 0.001), 1);
    tentInside.children.forEach((c, i) => {
      if (c === floor) return;
      c.position.y = 0.02 + (1 - Math.min(1, k * 1.4 - i * 0.12)) * 0.4;
    });
  }

  function enterTent() {
    const tent = roots.get('tent');
    if (!tent || mode !== 'camp' || trip) return;
    campSaved = { pos: camera.position.clone(), target: controls.target.clone() };
    setMode('tent');
    openGoal = 1;
    const centre = tent.getWorldPosition(new THREE.Vector3());
    const offset = new THREE.Vector3(0.7, 4.3, 3.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), tent.rotation.y);
    travel({ target: centre.clone().add(new THREE.Vector3(0, 0.1, 0)), pos: centre.clone().add(offset) }, 1.3);
  }

  function leaveTent() {
    if (mode !== 'tent') return;
    openGoal = 0;
    selected = null;
    glow();
    ui.onSelect(null);
    setMode('camp');
    const back = campSaved ?? { pos: camera.position.clone(), target: views.camp.target.clone() };
    travel({ target: back.target, pos: back.pos }, 1.2);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (selected) select(null);
    else if (mode === 'tent') leaveTent();
    else if (mode === 'camp') climbOut();
  }, on);

  function select(id: string | null) {
    const item = id ? (roots.get(id)?.userData.gear as GearItem | undefined) : undefined;
    if (item && mode === 'mountain') {
      // Selecting from the list while on the mountain: go up first.
      queued = item.id;
      dive();
      return;
    }
    if (item?.id === 'tent' && mode === 'camp') {
      selected = null;
      glow();
      ui.onSelect(item);
      enterTent();
      return;
    }
    if (item?.inside && mode === 'camp') enterTent();
    if (item && !item.inside && mode === 'tent') leaveTent();
    selected = item ? item.id : null;
    glow();
    ui.onSelect(item ?? null);
  }

  // Loop ------------------------------------------------------------
  function resize() {
    const w = ui.stage.clientWidth, h = ui.stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Hold the horizontal field of view so the mountain fits on phones.
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(27)) / camera.aspect));
    camera.fov = THREE.MathUtils.clamp(vfov, 34, 72);
    camera.updateProjectionMatrix();
  }
  const sizer = new ResizeObserver(resize);
  sizer.observe(ui.stage);
  resize();

  let visible = true;
  const seen = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  seen.observe(ui.stage);

  const clock = new THREE.Clock();
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    const t = clock.elapsedTime;

    stepTrip(dt);
    if (openness !== openGoal) {
      openness = reduce ? openGoal : THREE.MathUtils.clamp(openness + Math.sign(openGoal - openness) * dt * 1.1, 0, 1);
      setTentFade(openness);
    }
    if (!reduce) {
      mist.update(dt);
      if (fireLight) fireLight.intensity = 2.6 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.2;
      if (flame) flame.scale.y = 0.8 + Math.sin(t * 11) * 0.08;
      for (const m of mixers) m.update(dt);
    }
    if (!trip) controls.update(dt);

    // Keep depth precision across a 1000:1 range of distances.
    const d = camera.position.distanceTo(controls.target);
    camera.near = THREE.MathUtils.clamp(d * 0.02, 0.05, 20);
    camera.far = d + 7000;
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
  });

  /** Stop, free the GPU and remove every listener, ready for another mountain. */
  function dispose() {
    disposed = true;
    life.abort();
    sizer.disconnect();
    seen.disconnect();
    renderer.setAnimationLoop(null);
    controls.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material ?? []].flat()) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    ui.veil.style.opacity = '0';
    ui.label.hidden = true;
  }

  return { select, dive, climbOut, dispose };
}
