// Pointer, wheel and touch on the 3D world. The canvas sits behind the page,
// so input arrives on the page itself; anything over the page's own UI (the
// panel, the tabs, links and buttons, the camp's cards) is left alone.
// Scrolling down always goes in, as it goes down the page, and scrolling up
// comes back out, so a long flick can't dive in and straight back out again.
//  - Landscape: scrolling down (or swiping up) zooms toward the camp, and
//    going all the way dives to the campsite.
//  - Campsite: drag to look around, scroll or pinch to zoom; pulling well past
//    the far limit goes back up to the landscape. Hover lights things up;
//    clicking the person or a piece of kit pins its card, the tent goes inside.
//  - Tent: scrolling up (or Esc) leaves it.
import { navigate } from 'astro:transitions/client';
import type { Pickable } from './scene/camp';
import type { World } from './World';

const UI_SELECTOR =
  'a, button, input, select, textarea, label, summary, .panel, .crew-tabs, header, footer, .wui-card, .wui-hotspot, .wui-marker, .wui-exit, [data-no-world]';

export type ControlsUi = {
  hover(pickable: Pickable | null, x: number, y: number): void;
  activate(pickable: Pickable, x: number, y: number): void;
  /** True if a pinned card closed (so Esc did something). */
  dismiss(): boolean;
  /** A gesture happened at this level: the hint can go. */
  used(): void;
};

/** Wheel deltas in pixels, whatever mode the device reports them in. */
const wheelPixels = (event: WheelEvent) => event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1);

export function connectControls(world: World, ui: ControlsUi) {
  const overUi = (target: EventTarget | null) => !(target instanceof Element) || target.closest(UI_SELECTOR) !== null;
  const person = () => ('person' in world.route ? world.route.person : undefined);
  let leaving = false;
  const go = (path: string) => {
    if (leaving || !person()) return;
    leaving = true;
    void navigate(path);
  };
  document.addEventListener('astro:after-swap', () => (leaving = false));
  const toCamp = () => go(`/gear/${person()}/camp/`);
  const toLandscape = () => go(`/gear/${person()}/`);

  // Pulling back out, a little at a time, adds up: past the campsite's far
  // limit it leads out to the landscape, and in the tent, out of the tent.
  let outward = 0;
  let outwardAt = 0;
  const pullBack = (amount: number, enough: number, then: () => void) => {
    const now = performance.now();
    if (now - outwardAt > 700) outward = 0;
    outwardAt = now;
    outward += amount;
    if (outward <= enough) return;
    outward = 0;
    then();
  };
  const outOfTent = () => world.leaveTent();

  // On a camp's pages the scene takes the wheel (outside the page's own UI), even mid-move, so the page never scrolls away under it.
  const overCamp = () => /^(biome|camp)$/.test(document.documentElement.dataset.level ?? '');
  document.addEventListener(
    'wheel',
    (event) => {
      if (!overCamp() || overUi(event.target)) return;
      event.preventDefault();
      const level = world.level;
      if (!level) return;
      // Trackpad pinches arrive as ctrl+wheel, the other way round (spreading
      // is negative), and in smaller steps.
      const dy = wheelPixels(event);
      const inward = event.ctrlKey ? -dy : dy;
      ui.used();
      if (level === 'landscape') {
        // About fifteen notches of a mouse wheel, or a couple of trackpad swipes, from afar to the dive.
        if (world.zoomBy((inward / 1500) * (event.ctrlKey ? 6 : 1))) toCamp();
      } else if (level === 'camp') {
        const over = world.dollyBy(Math.exp(-inward * (event.ctrlKey ? 0.01 : 0.0015)));
        if (inward < 0 && over > 0) pullBack(-inward / 400, 1.2, toLandscape);
        else if (inward > 0) outward = 0;
      } else if (level === 'tent' && inward < 0) {
        pullBack(-inward / 400, 0.25, outOfTent);
      }
    },
    { passive: false },
  );

  // Pointers: a drag orbits (or, on the landscape, a vertical touch drag zooms);
  // two touches pinch; a press that barely moves is a click.
  const pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  let pinch = 0;
  let dragged = false;
  document.addEventListener('pointerdown', (event) => {
    const level = world.level;
    if (!level || overUi(event.target) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY });
    if (pointers.size === 1) dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  document.addEventListener('pointermove', (event) => {
    const level = world.level;
    const held = pointers.get(event.pointerId);
    if (!held) {
      // Plain hover with a mouse or pen. The hotspots and the card look after themselves.
      if (event.pointerType !== 'touch' && (level === 'camp' || level === 'tent')) {
        if (event.target instanceof Element && event.target.closest('#world-ui')) return;
        const pickable = overUi(event.target) ? null : world.pickAt(event.clientX, event.clientY);
        world.setHighlight(pickable?.id ?? null);
        ui.hover(pickable, event.clientX, event.clientY);
        document.documentElement.style.cursor = pickable ? 'pointer' : level === 'camp' ? 'grab' : '';
      }
      return;
    }
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    held.x = event.clientX;
    held.y = event.clientY;
    if (Math.hypot(held.x - held.x0, held.y - held.y0) > 6) dragged = true;
    if (!dragged) return;
    ui.used();
    if (pointers.size === 2 && level === 'camp') {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && spread > 0) {
        const over = world.dollyBy(pinch / spread);
        if (spread < pinch && over > 0) pullBack((pinch - spread) / 120, 1.2, toLandscape);
      }
      pinch = spread;
    } else if (level === 'camp') {
      world.orbitBy(dx, dy);
      document.documentElement.style.cursor = 'grabbing';
      ui.hover(null, 0, 0);
    } else if (level === 'landscape' && event.pointerType === 'touch') {
      if (world.zoomBy(-dy / 520)) toCamp();
    }
  });
  const release = (event: PointerEvent) => {
    const held = pointers.get(event.pointerId);
    if (!held) return;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
    const level = world.level;
    if (document.documentElement.style.cursor === 'grabbing') document.documentElement.style.cursor = level === 'camp' ? 'grab' : '';
    if (dragged || event.type === 'pointercancel' || (level !== 'camp' && level !== 'tent')) return;
    // A click (or tap) on the scene.
    const pickable = world.pickAt(event.clientX, event.clientY);
    if (pickable) {
      ui.activate(pickable, event.clientX, event.clientY);
    } else {
      ui.dismiss();
      if (event.pointerType === 'touch') world.setHighlight(null);
    }
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  // Esc closes a pinned card, then leaves the tent, before the page's own Esc (up a level) gets it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (ui.dismiss()) event.preventDefault();
      else if (world.level === 'tent') {
        world.leaveTent();
        event.preventDefault();
      }
    },
    true,
  );

  // A new level starts its own pulling back; leaving the camp or the tent puts the cursor back.
  world.onLevel((level) => {
    outward = 0;
    if (level !== 'camp' && level !== 'tent') document.documentElement.style.cursor = '';
  });
}
