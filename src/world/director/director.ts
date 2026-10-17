// The Director runs every change of scene (GEAR-3D-PLAN.md §5).
//  - Between two camps (travel): the colour drains and the camera lifts away,
//    the world dissolves into the page's paper, the camps swap out of sight
//    under it (once the new page has swapped and the next camp is built), then
//    the new camp's landscape emerges and the colour returns.
//  - Within a camp (dive and rise): from the landscape down to the campsite,
//    or back up, through a cloud that fills the frame for the fastest part.
//  - To and from the 2D pages it fades to paper.
// One timeline, driven by the world clock, so tests can seek it.
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import type { BiomeId } from '../../data/biomes';
import type { CameraRig, Pose } from '../camera/rig';
import { PRESETS, cloneParams, lerpParams, limboOf, type BiomeParams } from '../scene/biomes';

export type View = 'landscape' | 'camp';
export type CampTarget = { kind: 'biome'; biome: BiomeId; view: View };
export type Target = CampTarget | { kind: 'paper' };

export type DirectorHost = {
  rig: CameraRig;
  aspect(): number;
  /** Where the camera rests for a target, framed for this screen (sync: stations are data). */
  restPose(target: CampTarget): Pose;
  /** Hand the camera back to the rig, resting on the target. */
  settle(target: CampTarget): void;
  /** Build and compile a biome's set; resolves when it can be shown. */
  prepare(biome: BiomeId): Promise<void>;
  /** Make a prepared biome's set the visible one. */
  show(biome: BiomeId): void;
  /** What to draw this frame: the parameters, limbo, paper, and the cloud the camera is flying through. */
  apply(params: BiomeParams, limbo: number, paper: number, fly: number, flyTime: number): void;
};

type Style = 'travel' | 'cut' | 'reveal' | 'fade' | 'dive' | 'rise';

// Seconds. Desktop timing; phones run the same shape 10% faster.
const DRAINED = 0.55;
const VEILED = 0.95;
const GATE = 1.0;
const UNVEIL = 1.05;
const CLEAR = 1.6;
const END = 2.2;
const DIVE = 1.8;
const RISE = 1.6;
const CUT = 0.075;
const REVEAL = 0.7;
const FADE = 0.45;

const ease = (t: number) => {
  const x = MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const easeOut = (t: number) => 1 - (1 - MathUtils.clamp(t, 0, 1)) ** 3;
const window01 = (t: number, a: number, b: number, c: number, d: number) =>
  MathUtils.smoothstep(t, a, b) * (1 - MathUtils.smoothstep(t, c, d));

/** How grey the world is during a travel, 0 (full colour) to 1 (limbo). */
const limboAt = (t: number) => (t < DRAINED ? ease(t / DRAINED) : t < CLEAR ? 1 : 1 - ease((t - CLEAR) / (END - CLEAR)));
/** How far the world has dissolved into paper during a travel. */
const veilAt = (t: number) =>
  t < DRAINED ? 0 : t < VEILED ? ease((t - DRAINED) / (VEILED - DRAINED)) : t < UNVEIL ? 1 : 1 - ease((t - UNVEIL) / (CLEAR - UNVEIL));
/** How much of the frame the cloud fills on a dive or a rise. */
const flyAt = (style: Style, t: number) =>
  style === 'dive' ? window01(t, 0.25, 0.62, 1.05, 1.5) : style === 'rise' ? window01(t, 0.12, 0.5, 0.95, 1.35) : 0;

type Path = { position: CatmullRomCurve3; target: CatmullRomCurve3 };

type Run = {
  style: Style;
  target: Target;
  time: number;
  duration: number;
  /** Where the timeline starts, so an interrupted travel continues from its current limbo and veil. */
  startAt: number;
  from: BiomeParams;
  fromPaper: number;
  ready: boolean;
  swappedPage: boolean;
  swappedSets: boolean;
  /** Travel: lifting away from where the camera was, then settling onto the new rest pose. Dive and rise: one path. */
  leave?: Path;
  arrive?: Path;
  inLimbo: (() => void)[];
};

const copyParams = (source: BiomeParams, out: BiomeParams) => lerpParams(source, source, 1, out);

const sameTarget = (a: Target, b: Target) =>
  a.kind === b.kind && (a.kind === 'paper' || (a.biome === (b as CampTarget).biome && a.view === (b as CampTarget).view));

const curve = (points: Vector3[]) => new CatmullRomCurve3(points, false, 'centripetal');

export class Director {
  /** What's on screen at rest. */
  resting: Target = { kind: 'paper' };
  limbo = 0;
  paper = 1;
  fly = 0;
  /** Tests: when true, the timeline only moves through seek(). */
  manual = false;
  readonly params: BiomeParams = cloneParams(PRESETS.limbo);
  private run: Run | null = null;
  private speed = 1;
  private readonly greyFrom = cloneParams(PRESETS.limbo);
  private readonly greyTo = cloneParams(PRESETS.limbo);

  constructor(private readonly host: DirectorHost) {}

  get active() {
    return this.run !== null;
  }

  /** Where the Director is heading, or resting. */
  get target(): Target {
    return this.run?.target ?? this.resting;
  }

  /** At the gate, waiting for the new page or the next camp. */
  get holding() {
    const run = this.run;
    if (!run || run.swappedSets || run.target.kind === 'paper') return false;
    const gate = run.style === 'travel' ? GATE : run.style === 'cut' ? CUT : 0;
    return run.time >= gate;
  }

  get phase(): 'idle' | 'leaving' | 'travel' | 'arriving' | 'fading' | 'diving' | 'rising' {
    const run = this.run;
    if (!run) return 'idle';
    if (run.style === 'dive') return 'diving';
    if (run.style === 'rise') return 'rising';
    if (run.style !== 'travel') return 'fading';
    if (run.time < DRAINED) return 'leaving';
    if (run.time < CLEAR) return 'travel';
    return 'arriving';
  }

  setSpeed(phone: boolean) {
    this.speed = phone ? 1 / 0.9 : 1;
  }

  /** Go to a target. `motion` is 'reduced' for prefers-reduced-motion: cuts instead of moves. */
  go(target: Target, motion: 'full' | 'reduced') {
    if (this.run && sameTarget(this.run.target, target)) return;
    if (!this.run && sameTarget(this.resting, target) && (target.kind === 'paper' ? this.paper >= 1 : this.paper <= 0)) return;

    const previous = this.run;
    previous?.inLimbo.splice(0).forEach((resolve) => resolve());
    const from = cloneParams(this.params);
    const current = this.target;
    let style: Style;
    if (target.kind === 'paper') style = 'fade';
    else if (this.paper >= 0.999 || (this.resting.kind === 'paper' && !previous)) style = 'reveal';
    else if (motion === 'reduced') style = 'cut';
    else if (current.kind === 'biome' && current.biome === target.biome && (!previous || previous.swappedSets)) style = target.view === 'camp' ? 'dive' : 'rise';
    else style = 'travel';
    if (style === 'travel' && previous && previous.style !== 'travel' && previous.style !== 'dive' && previous.style !== 'rise') style = 'reveal';

    const sameSet = style === 'dive' || style === 'rise';
    const run: Run = {
      style,
      target,
      time: 0,
      duration: { travel: END, cut: CUT * 2, reveal: REVEAL, fade: FADE, dive: DIVE, rise: RISE }[style],
      startAt: 0,
      from,
      fromPaper: this.paper,
      ready: target.kind === 'paper' || sameSet,
      swappedPage: target.kind === 'paper' || sameSet,
      swappedSets: target.kind === 'paper' || sameSet,
      inLimbo: [],
    };
    if (style === 'travel') {
      // An interrupted travel picks up where its limbo and veil had got to:
      // still draining, or already veiled (the swap then waits for the new camp).
      run.startAt = run.time = previous?.style === 'travel' && this.paper > 0.001
        ? DRAINED + (VEILED - DRAINED) * Math.min(1, this.paper)
        : DRAINED * Math.min(1, this.limbo);
      const biome = (target as CampTarget).biome;
      run.leave = this.leavePath();
      run.arrive = this.arrivePath(target as CampTarget);
      // The colours stay put; only the palette drains, so the camp's clouds don't move.
      limboOf(from, this.greyFrom);
      limboOf(PRESETS[biome], this.greyTo);
    }
    if (sameSet) run.leave = this.divePath(target as CampTarget, style === 'dive');
    this.run = run;
    if (target.kind === 'biome' && !sameSet) {
      void this.host.prepare(target.biome).then(() => {
        if (this.run === run) run.ready = true;
      });
    }
  }

  /** The new page's HTML is in place. */
  swapped(target: Target) {
    if (this.run && sameTarget(this.run.target, target)) this.run.swappedPage = true;
  }

  /** Resolves once the screen is in limbo, so the page can swap out of sight. */
  whenInLimbo(): Promise<void> {
    const run = this.run;
    if (!run || run.style === 'fade' || run.style === 'reveal' || run.style === 'dive' || run.style === 'rise') return Promise.resolve();
    if (this.limbo >= 0.999 || (run.style === 'cut' && this.paper >= 0.999)) return Promise.resolve();
    return new Promise((resolve) => {
      run.inLimbo.push(resolve);
      // Never hold a navigation hostage if frames stop (a hidden tab, say).
      setTimeout(resolve, 1500);
    });
  }

  /** Tests: jump the running timeline to `seconds`. */
  seek(seconds: number) {
    if (!this.run) return;
    this.run.time = Math.max(this.run.startAt, seconds);
    this.step(0, true);
  }

  update(dt: number) {
    if (!this.run) return;
    // In manual mode (frozen tests) fades and reveals finish at once; moves wait for seek().
    const moves = this.run.style === 'travel' || this.run.style === 'dive' || this.run.style === 'rise';
    this.step(this.manual ? (moves ? 0 : 10) : dt * this.speed, false);
  }

  private step(dt: number, seeking: boolean) {
    const run = this.run!;
    const gate = run.style === 'travel' ? GATE : run.style === 'cut' ? CUT : 0;
    const open = run.ready && run.swappedPage;
    let time = run.time + dt;
    // Hold at the gate until the page has swapped and the next set is built.
    if (!open && time > gate && !seeking) time = gate;
    run.time = Math.min(time, run.duration);

    if (!run.swappedSets && run.time >= gate && open) {
      const target = run.target as CampTarget;
      this.host.show(target.biome);
      run.swappedSets = true;
      // Cuts and reveals start at rest on the target; only travel flies there.
      if (run.style !== 'travel') this.settleOn(target);
    }

    const to = run.target.kind === 'biome' ? PRESETS[run.target.biome] : run.from;
    const t = run.time;
    this.fly = 0;
    switch (run.style) {
      case 'travel': {
        this.limbo = limboAt(t);
        this.paper = veilAt(t);
        // Before the swap: the old camp draining to grey clay. After: the new one filling with colour.
        if (run.swappedSets) lerpParams(to, this.greyTo, this.limbo, this.params);
        else lerpParams(run.from, this.greyFrom, this.limbo, this.params);
        const path = run.swappedSets ? run.arrive! : run.leave!;
        const u = run.swappedSets
          ? ease((t - GATE) / (END - GATE))
          : easeOut((t - run.startAt) / Math.max(GATE - run.startAt, 1e-3));
        this.host.rig.drive({ position: path.position.getPointAt(u), target: path.target.getPointAt(u) });
        this.host.rig.lookWeight = 0;
        break;
      }
      case 'dive':
      case 'rise': {
        // The same camp throughout: its own colours, and a cloud to fly through.
        this.limbo = 0;
        this.paper = 0;
        this.fly = flyAt(run.style, t);
        lerpParams(run.from, to, ease(t / run.duration), this.params);
        const path = run.leave!;
        const u = ease(t / run.duration);
        this.host.rig.drive({ position: path.position.getPointAt(u), target: path.target.getPointAt(u) });
        this.host.rig.lookWeight = 0;
        break;
      }
      case 'cut': {
        this.paper = t < CUT ? Math.max(run.fromPaper, t / CUT) : run.swappedSets ? 1 - (t - CUT) / CUT : 1;
        copyParams(run.swappedSets ? to : run.from, this.params);
        this.limbo = 0;
        // A cut within a camp swaps nothing; it just lands on the new view under the paper.
        if (t >= CUT && run.target.kind === 'biome') this.settleOn(run.target);
        break;
      }
      case 'reveal': {
        if (run.swappedSets) {
          copyParams(to, this.params);
          this.paper = run.fromPaper * (1 - ease(t / REVEAL));
          this.limbo = 0;
        }
        break;
      }
      case 'fade': {
        this.paper = run.fromPaper + (1 - run.fromPaper) * ease(t / FADE);
        break;
      }
    }

    if (this.limbo >= 0.999 || this.paper >= 0.999) run.inLimbo.splice(0).forEach((resolve) => resolve());
    this.host.apply(this.params, this.limbo, this.paper, this.fly, t);

    if (run.time >= run.duration && (run.swappedSets || run.target.kind === 'paper')) this.finish(run);
  }

  private settled: Target | null = null;
  private settleOn(target: CampTarget) {
    if (this.settled && sameTarget(this.settled, target)) return;
    this.settled = target;
    this.host.rig.drive(null);
    this.host.settle(target);
  }

  private finish(run: Run) {
    run.inLimbo.splice(0).forEach((resolve) => resolve());
    this.run = null;
    this.resting = run.target;
    this.limbo = 0;
    this.fly = 0;
    this.paper = run.target.kind === 'paper' ? 1 : 0;
    this.settled = null;
    if (run.target.kind === 'biome') {
      copyParams(PRESETS[run.target.biome], this.params);
      this.host.rig.drive(null);
      this.host.settle(run.target);
    }
    this.host.apply(this.params, this.limbo, this.paper, 0, 0);
  }

  /** From wherever the camera is: up and back from the camp, as if lifting away, looking a little higher. */
  private leavePath(): Path {
    const camera = this.host.rig.camera;
    const p0 = camera.position.clone();
    const look = new Vector3();
    camera.getWorldDirection(look);
    const flat = new Vector3(look.x, 0, look.z).normalize();
    const t0 = p0.clone().addScaledVector(look, 300);
    return {
      position: curve([
        p0,
        p0.clone().addScaledVector(flat, -60).add(new Vector3(0, 90, 0)),
        p0.clone().addScaledVector(flat, -170).add(new Vector3(0, 240, 0)),
      ]),
      target: curve([t0, t0.clone().add(new Vector3(0, 120, 0)), p0.clone().addScaledVector(flat, 1400).add(new Vector3(0, 160, 0))]),
    };
  }

  /** Down onto the new rest pose from above and behind it. */
  private arrivePath(target: CampTarget): Path {
    const rest = this.host.restPose(target);
    const flat = rest.target.clone().sub(rest.position).setY(0).normalize();
    const lift = Math.max(120, rest.position.distanceTo(rest.target) * 0.25);
    const p = rest.position;
    const t = rest.target;
    return {
      position: curve([
        p.clone().addScaledVector(flat, -lift).add(new Vector3(0, lift * 1.1, 0)),
        p.clone().addScaledVector(flat, -lift * 0.3).add(new Vector3(0, lift * 0.3, 0)),
        p.clone(),
      ]),
      target: curve([t.clone().add(new Vector3(0, lift * 0.6, 0)), t.clone().add(new Vector3(0, lift * 0.12, 0)), t.clone()]),
    };
  }

  /**
   * Within a camp, from the current pose to the target view's rest pose. The
   * dive drops toward the campsite and the rise climbs away from it; the cloud
   * fills the frame for the fast middle, so the path can be direct.
   */
  private divePath(target: CampTarget, down: boolean): Path {
    const camera = this.host.rig.camera;
    const p0 = camera.position.clone();
    const t0 = camera.getWorldDirection(new Vector3()).multiplyScalar(Math.max(60, p0.distanceTo(this.host.restPose(target).target))).add(p0);
    const rest = this.host.restPose(target);
    const p1 = rest.position.clone();
    const t1 = rest.target.clone();
    // Through the middle: most of the way down (or up), above the line between the two.
    const mid = p0.clone().lerp(p1, down ? 0.62 : 0.38);
    mid.y = Math.max(mid.y, Math.min(p0.y, p1.y) + Math.abs(p0.y - p1.y) * 0.45);
    return {
      position: curve([p0, mid, p1]),
      target: curve([t0, t0.clone().lerp(t1, 0.6), t1]),
    };
  }
}
