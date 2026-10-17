import { Timer } from 'three';

/**
 * Scene time in seconds. A frozen clock (?freeze, ?t=) stands still at a fixed
 * time, so screenshots of anything driven by time repeat exactly.
 */
export class WorldClock {
  private readonly timer = new Timer();
  private frozenAt: number | null;

  constructor({ frozen, time }: { frozen: boolean; time: number }) {
    this.frozenAt = frozen ? time : null;
    // Pauses while the tab is hidden, so time doesn't jump when the visitor comes back.
    this.timer.connect(document);
  }

  get frozen() {
    return this.frozenAt !== null;
  }

  /** Seconds since the world started, or the frozen time. */
  get elapsed() {
    return this.frozenAt ?? this.timer.getElapsed();
  }

  /** Seconds since the previous frame, capped so one slow frame can't throw motion off. */
  get delta() {
    return this.frozenAt === null ? Math.min(this.timer.getDelta(), 0.1) : 0;
  }

  update(timestamp?: number) {
    this.timer.update(timestamp);
  }

  /** Stop at a given time, for tests and posters. */
  freeze(time: number) {
    this.frozenAt = time;
  }

  dispose() {
    this.timer.dispose();
  }
}
