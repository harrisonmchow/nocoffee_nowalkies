// The camera rig (threejs-camera-direction). It rests in one of two ways:
//  - at a station (a camp's landscape, or inside the tent), with a small,
//    bounded look-around that follows the pointer, and on the landscape a
//    zoom toward the camp that scrolling drives;
//  - orbiting the campsite, which dragging turns and scrolling or pinching
//    dollies, kept above the ground.
// Short moves between them (into the tent and out) fly on their own. During a
// transition the Director writes the pose directly through `drive`, with no
// smoothing stacked on top, and the look-around fades out.
import { MathUtils, PerspectiveCamera, Vector2, Vector3 } from 'three';

export type Pose = { position: Vector3; target: Vector3; fov: number };
/** A camp's camera station. `portrait` is the pose for tall screens, blended in as the screen narrows. */
export type Station = Pose & { portrait?: Pose };

/** Orbiting the campsite: angles in radians, yaw 0 puts the camera south (+z) of the centre, looking north. */
export type OrbitSpec = {
  centre: Vector3;
  yaw: number;
  pitch: number;
  distance: number;
  fov: number;
  /** Dolly limits in metres; pitch limits in radians. */
  near: number;
  far: number;
  minPitch: number;
  maxPitch: number;
  /** Ground height, so the camera never goes under it. */
  ground: (x: number, z: number) => number;
};

const YAW = MathUtils.degToRad(1.6);
const PITCH = MathUtils.degToRad(1.0);
const FOLLOW = 3.5;
const ORBIT_FOLLOW = 9;
const CENTRE = new Vector2(0, 0);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraRig {
  readonly camera = new PerspectiveCamera(42, 1, 0.3, 30000);
  /** 0 during transitions, 1 at rest; scales the look-around. */
  lookWeight = 1;
  mode: 'station' | 'orbit' = 'station';
  /** On a landscape: how far scrolling has zoomed toward the camp, 0 to 1. */
  zoom = 0;
  private zoomShown = 0;
  private station: Station | null = null;
  private approach: Station | null = null;
  private orbit: OrbitSpec | null = null;
  private readonly orbitNow = { yaw: 0, pitch: 0, distance: 1 };
  private readonly orbitGoal = { yaw: 0, pitch: 0, distance: 1 };
  private flight: { from: Pose; to: Pose; time: number; duration: number; done: () => void } | null = null;
  private driven: { position: Vector3; target: Vector3 } | null = null;
  private readonly pointer = new Vector2();
  private readonly look = new Vector2();
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly listeners = new AbortController();
  /** Where the shot's centre should land, as fractions of the viewport (y from the top), and where it is now. */
  private readonly frameGoal = new Vector2(0.5, 0.5);
  private readonly frameCentre = new Vector2(0.5, 0.5);
  private fov = 42;

  constructor() {
    window.addEventListener(
      'pointermove',
      (event) => this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, 1 - (event.clientY / window.innerHeight) * 2),
      { passive: true, signal: this.listeners.signal },
    );
  }

  /** Rest at a station. `approach` is where the landscape's zoom heads (toward the camp). */
  setStation(station: Station, approach: Station | null = null) {
    this.mode = 'station';
    this.station = station;
    this.approach = approach;
    this.flight = null;
  }

  /** Orbit the campsite from the spec's starting angles, or keep the current ones when `keep` is set. */
  setOrbit(orbit: OrbitSpec, keep = false) {
    this.mode = 'orbit';
    this.orbit = orbit;
    this.flight = null;
    if (!keep) {
      Object.assign(this.orbitNow, { yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance });
      Object.assign(this.orbitGoal, this.orbitNow);
    }
  }

  get orbiting() {
    return this.mode === 'orbit' && !this.flight;
  }

  get flying() {
    return this.flight !== null;
  }

  /** Still easing toward where it was asked to be: a flight, the orbit's damping, or the landscape's zoom. */
  get settling() {
    if (this.flight) return true;
    // Easing to a new frame centre (the panel opened, say): keep drawing until the shot gets there.
    if (this.frameCentre.distanceToSquared(this.frameGoal) > 2.5e-7) return true;
    if (this.mode === 'orbit') {
      const now = this.orbitNow;
      const goal = this.orbitGoal;
      return Math.abs(goal.yaw - now.yaw) + Math.abs(goal.pitch - now.pitch) + Math.abs(goal.distance - now.distance) * 0.05 > 1e-4;
    }
    return Math.abs(this.zoom - this.zoomShown) > 1e-4;
  }

  /** Turn the orbit: dx, dy in screen pixels. */
  orbitBy(dx: number, dy: number) {
    if (!this.orbit) return;
    this.orbitGoal.yaw -= dx * 0.0055;
    this.orbitGoal.pitch = MathUtils.clamp(this.orbitGoal.pitch + dy * 0.004, this.orbit.minPitch, this.orbit.maxPitch);
  }

  /**
   * Dolly the orbit by a factor (more than 1 is out). Returns how far past the
   * far limit the request went, so pulling back from the campsite can lead
   * out to the landscape.
   */
  dolly(factor: number) {
    if (!this.orbit) return 0;
    const wanted = this.orbitGoal.distance * factor;
    this.orbitGoal.distance = MathUtils.clamp(wanted, this.orbit.near, this.orbit.far);
    return Math.max(0, wanted / this.orbit.far - 1);
  }

  /** The orbit's current angles, for tests and the debug panel. */
  get orbitAngles() {
    return { ...this.orbitNow };
  }

  /** Fly to a pose over `seconds`, then call `done` (which usually sets the next resting mode). */
  flyTo(to: Pose, seconds: number, done: () => void) {
    const from = { position: this.camera.position.clone(), target: this.currentTarget(), fov: this.fov };
    this.flight = { from, to, time: 0, duration: Math.max(seconds, 1e-3), done };
  }

  /** The vertical FOV as seen on screen (the camera's own fov is wider when the shot is shifted). */
  get visibleFov() {
    return this.fov;
  }

  /**
   * A station's pose framed for this aspect ratio. Tall screens blend to the
   * station's portrait pose, or else step back and widen.
   */
  framed(station: Station, aspect: number, out: Pose = { position: new Vector3(), target: new Vector3(), fov: 42 }) {
    const portrait = MathUtils.clamp((1 - aspect) / 0.55, 0, 1);
    if (station.portrait) {
      out.position.lerpVectors(station.position, station.portrait.position, portrait);
      out.target.lerpVectors(station.target, station.portrait.target, portrait);
      out.fov = MathUtils.lerp(station.fov, station.portrait.fov, portrait);
      return out;
    }
    out.target.copy(station.target);
    out.position.copy(station.position).sub(station.target).multiplyScalar(1 + 0.35 * portrait).add(station.target);
    out.fov = MathUtils.lerp(station.fov, 58, portrait);
    return out;
  }

  /** An orbit's pose at given angles (the spec's own unless given). */
  orbitPose(orbit: OrbitSpec, angles = { yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance }, out?: Pose): Pose {
    const pose = out ?? { position: new Vector3(), target: new Vector3(), fov: orbit.fov };
    const { yaw, pitch, distance } = angles;
    pose.target.copy(orbit.centre);
    pose.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance).add(orbit.centre);
    const floor = orbit.ground(pose.position.x, pose.position.z) + 1.2;
    if (pose.position.y < floor) pose.position.y = floor;
    pose.fov = orbit.fov;
    return pose;
  }

  /** The pose the rig is resting at (or heading for) right now, framed for this aspect ratio. */
  restPose(aspect: number): Pose {
    if (this.mode === 'orbit' && this.orbit) return this.orbitPose(this.orbit, this.orbitGoal);
    if (this.station) return this.stationPose(aspect, this.zoom);
    return { position: this.camera.position.clone(), target: this.currentTarget(), fov: this.fov };
  }

  /** Hand the camera to the Director for one frame. Pass null to give it back. */
  drive(pose: { position: Vector3; target: Vector3; fov?: number } | null) {
    this.driven = pose;
    if (pose?.fov) this.fov = pose.fov;
  }

  /**
   * Centre the shot on part of the screen, e.g. the stage beside a person's
   * panel. It's a lens shift (a view offset), so the camera's aim and the
   * framing of the scene stay the same; only where it lands on screen moves.
   */
  setFrameCentre(x: number, y: number, immediate = false) {
    this.frameGoal.set(MathUtils.clamp(x, 0.2, 0.8), MathUtils.clamp(y, 0.2, 0.8));
    if (immediate) this.frameCentre.copy(this.frameGoal);
  }

  /** How far the landscape has flown in toward the camp, as drawn (0 to 1). */
  get zoomed() {
    return this.zoomShown;
  }

  /** Where the shot is centred on screen (0–1 of the canvas), once it gets there. */
  get frameAt(): Readonly<Vector2> {
    return this.frameGoal;
  }

  private stationPose(aspect: number, zoom: number): Pose {
    const pose = this.framed(this.station!, aspect);
    if (this.approach && zoom > 0) {
      const near = this.framed(this.approach, aspect);
      const k = easeInOut(MathUtils.clamp(zoom, 0, 1));
      pose.position.lerp(near.position, k);
      pose.target.lerp(near.target, k);
      pose.fov = MathUtils.lerp(pose.fov, near.fov, k);
    }
    return pose;
  }

  private currentTarget() {
    return this.camera.getWorldDirection(new Vector3()).multiplyScalar(50).add(this.camera.position);
  }

  private project(aspect: number) {
    const camera = this.camera;
    const dx = this.frameCentre.x - 0.5;
    const dy = this.frameCentre.y - 0.5;
    if (Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) {
      camera.clearViewOffset();
      camera.aspect = aspect;
      camera.fov = this.fov;
    } else {
      // In units of the viewport height: a virtual image big enough that its
      // centre sits at the frame centre, widened so the visible FOV is unchanged.
      const width = aspect;
      const fullWidth = width * (1 + 2 * Math.abs(dx));
      const fullHeight = 1 + 2 * Math.abs(dy);
      const offsetX = fullWidth / 2 - width * (0.5 + dx);
      const offsetY = fullHeight / 2 - (0.5 + dy);
      camera.aspect = fullWidth / fullHeight;
      camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(this.fov) / 2) * fullHeight));
      camera.setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, 1);
    }
    camera.updateProjectionMatrix();
  }

  update(dt: number, aspect: number, allowLook: boolean) {
    const camera = this.camera;
    this.frameCentre.lerp(this.frameGoal, 1 - Math.exp(-4 * dt));
    if (this.driven) {
      camera.position.copy(this.driven.position);
      camera.lookAt(this.driven.target);
      this.project(aspect);
      return;
    }

    if (this.flight) {
      const f = this.flight;
      f.time = Math.min(f.duration, f.time + dt);
      const k = easeInOut(f.time / f.duration);
      this.position.lerpVectors(f.from.position, f.to.position, k);
      // A little lift through the middle, so the move arcs rather than slides.
      this.position.y += Math.sin(Math.PI * k) * 0.08 * f.from.position.distanceTo(f.to.position);
      this.target.lerpVectors(f.from.target, f.to.target, k);
      this.fov = MathUtils.lerp(f.from.fov, f.to.fov, k);
      camera.position.copy(this.position);
      camera.lookAt(this.target);
      this.project(aspect);
      if (f.time >= f.duration) {
        this.flight = null;
        f.done();
      }
      return;
    }

    if (this.mode === 'orbit' && this.orbit) {
      const k = 1 - Math.exp(-ORBIT_FOLLOW * dt);
      this.orbitNow.yaw += (this.orbitGoal.yaw - this.orbitNow.yaw) * k;
      this.orbitNow.pitch += (this.orbitGoal.pitch - this.orbitNow.pitch) * k;
      this.orbitNow.distance += (this.orbitGoal.distance - this.orbitNow.distance) * k;
      const pose = this.orbitPose(this.orbit, this.orbitNow);
      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
      this.fov = pose.fov;
      this.project(aspect);
      return;
    }

    if (!this.station) return;
    this.zoomShown += (this.zoom - this.zoomShown) * (1 - Math.exp(-6 * dt));
    const framed = this.stationPose(aspect, this.zoomShown);
    // Frame-rate-independent follow toward the pointer, then a bounded offset.
    const k = 1 - Math.exp(-FOLLOW * dt);
    this.look.lerp(allowLook ? this.pointer : CENTRE, k);
    const weight = this.lookWeight;
    this.position.copy(framed.position);
    this.forward.copy(framed.target).sub(framed.position);
    const distance = this.forward.length();
    this.forward.divideScalar(distance);
    this.right.crossVectors(this.forward, camera.up).normalize();
    this.target
      .copy(framed.target)
      .addScaledVector(this.right, Math.tan(YAW * this.look.x * weight) * distance)
      .addScaledVector(camera.up, Math.tan(PITCH * this.look.y * weight) * distance);
    // A little parallax: the camera shifts a touch the other way.
    this.position.addScaledVector(this.right, -this.look.x * weight * distance * 0.006);
    camera.position.copy(this.position);
    camera.lookAt(this.target);
    this.fov = framed.fov;
    this.project(aspect);
  }

  dispose() {
    this.listeners.abort();
  }
}
