// What sits over the 3D world: on a landscape, a marker at the camp with a way
// in; at the campsite and in the tent, a hotspot on each thing you can look
// at, its card, a hint, and the way out of the tent. Hotspots are real buttons,
// so everything the pointer can do, the keyboard and touch can too. It lives
// in #world-ui, which the ClientRouter carries across gear pages.
import { crew } from '../data/site';
import type { CampItem } from './route';
import type { Pickable } from './scene/camp';
import type { ControlsUi } from './controls';
import type { Level, World } from './World';

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** As lib/gear's formatWeight, which can't come to the browser (it reads content collections). */
const weight = (g?: number) => (!g ? 'Not weighed yet' : g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`);

/** What you can do here, for a mouse or trackpad and for touch (where the tent's button says it all). */
const HINTS: Record<'fine' | 'touch', Record<Level, string>> = {
  fine: {
    landscape: 'Scroll to fly closer',
    camp: 'Drag to look around · scroll to zoom',
    tent: 'Scroll up or press Esc to leave the tent',
  },
  touch: {
    landscape: 'Swipe up to fly closer',
    camp: 'Drag to look around · pinch to zoom',
    tent: '',
  },
};

/** Closest two hotspots' centres may sit, in pixels, before they're nudged apart. */
const SPREAD = 36;
/** How far a hotspot's dot sits from the thing it marks, in pixels: clear of it, near enough to read as its. */
const LIFT = 30;

export function connectUi(world: World, root: HTMLElement): ControlsUi {
  root.innerHTML = '';
  const marker = el('div', 'wui-marker');
  marker.innerHTML = '<span class="wui-marker__dot" aria-hidden="true"></span><a class="wui-marker__go" href="#"></a>';
  const go = marker.querySelector<HTMLAnchorElement>('.wui-marker__go')!;
  const hint = el('p', 'wui-hint');
  hint.setAttribute('aria-hidden', 'true');
  const card = el('div', 'wui-card');
  card.id = 'wui-card';
  card.hidden = true;
  card.setAttribute('role', 'group');
  const exit = el('button', 'wui-exit');
  exit.type = 'button';
  exit.textContent = 'Leave the tent';
  exit.hidden = true;
  exit.addEventListener('click', () => world.leaveTent());
  // The way out and the hint sit together, under the shot, at the foot of what's visible of the stage.
  const foot = el('div', 'wui-foot');
  foot.append(exit, hint);
  const hotspots = el('div', 'wui-hotspots');
  root.append(hotspots, marker, foot, card);
  const touch = matchMedia('(pointer: coarse)');

  let level: Level | null = null;
  let spots: { pickable: Pickable; button: HTMLButtonElement }[] = [];
  let shownFor: Pickable | null = null;
  let pinned = false;
  const hinted = new Set<Level>();
  const screen = { x: 0, y: 0, behind: false };

  const items = (): CampItem[] => (world.route.level === 'camp' ? world.route.items : []);
  const personName = () => crew.find((c) => 'person' in world.route && c.id === world.route.person)?.name ?? '';
  const itemFor = (pickable: Pickable) => items().find((i) => i.id === pickable.id);
  const labelFor = (pickable: Pickable) =>
    pickable.kind === 'clothing' ? 'Clothing' : (itemFor(pickable)?.name ?? pickable.id);

  /** The card's content for a pickable. */
  const fill = (pickable: Pickable) => {
    const name = personName();
    if (pickable.kind === 'clothing') {
      const clothing = items().filter((i) => i.category === 'clothing');
      const rows = clothing
        .map((i) => `<li><span class="wui-card__name">${escape([i.brand, i.name].filter(Boolean).join(' '))}</span><span class="wui-card__weight">${escape(weight(i.weightG))}</span>${i.worn ? '' : '<span class="tag">Packed</span>'}</li>`)
        .join('');
      card.innerHTML = `<p class="wui-card__kicker">${escape(name)}’s clothing</p><h2 class="wui-card__title">What ${escape(name)} wears</h2><ul class="wui-card__list" role="list">${rows}</ul><a class="wui-card__link" href="/gear/${escape(String('person' in world.route ? world.route.person : ''))}/clothing/">See it laid out</a>`;
      card.setAttribute('aria-label', `${name}’s clothing`);
      return;
    }
    const item = itemFor(pickable);
    if (!item) return;
    const tent = pickable.kind === 'tent';
    // Clicking the tent goes inside rather than pinning its card, so the card says so instead of linking anywhere.
    const more = tent ? '<p class="wui-card__cta">Click to look inside</p>' : `<a class="wui-card__link" href="${escape(item.href)}">Details</a>`;
    card.innerHTML = `<p class="wui-card__kicker">${escape(name)}’s ${escape(tent ? 'shelter' : item.category === 'gear' ? 'gear' : 'clothing')}</p><h2 class="wui-card__title">${escape(item.name)}</h2>${item.brand ? `<p class="wui-card__brand">${escape(item.brand)}</p>` : ''}<dl class="wui-card__spec"><div><dt>Weight</dt><dd>${escape(weight(item.weightG))}</dd></div></dl>${more}`;
    card.setAttribute('aria-label', item.name);
  };

  const place = (x: number, y: number) => {
    card.hidden = false;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const left = Math.min(Math.max(12, x + 18), window.innerWidth - w - 12);
    const top = Math.min(Math.max(12, y - h / 2), window.innerHeight - h - 12);
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };

  const open = (pickable: Pickable, x: number, y: number, pin: boolean) => {
    if (shownFor !== pickable) fill(pickable);
    shownFor = pickable;
    pinned = pin;
    card.classList.toggle('is-pinned', pin);
    place(x, y);
  };
  const close = () => {
    card.hidden = true;
    shownFor = null;
    pinned = false;
    world.setHighlight(null);
  };

  /** Rebuild the hotspots for the level's pickables. */
  const buildSpots = () => {
    hotspots.innerHTML = '';
    spots = world.pickables.map((pickable, i) => {
      const button = el('button', 'wui-hotspot');
      button.type = 'button';
      const label = labelFor(pickable);
      // The dot's number is only there to tell the dots apart by eye. CSS draws
      // it, so the label is all the button's text and its name can say the same.
      button.innerHTML = `<span class="wui-hotspot__stem" aria-hidden="true"></span><span class="wui-hotspot__dot" data-n="${i + 1}" aria-hidden="true"></span><span class="wui-hotspot__label">${escape(label)}</span>`;
      button.setAttribute('aria-label', pickable.kind === 'tent' ? `${label}: look inside` : label);
      button.setAttribute('aria-describedby', 'wui-card');
      // Cards open beside the hotspot's label, which hangs to the right of its dot.
      const beside = () => {
        const r = button.getBoundingClientRect();
        const text = button.lastElementChild!.getBoundingClientRect();
        return [Math.max(r.right, text.right), r.top + r.height / 2] as const;
      };
      const show = () => {
        world.setHighlight(pickable.id);
        open(pickable, ...beside(), pinned && shownFor === pickable);
      };
      button.addEventListener('pointerenter', show);
      button.addEventListener('focus', show);
      button.addEventListener('pointerleave', () => !pinned && close());
      button.addEventListener('blur', () => !pinned && close());
      button.addEventListener('click', () => activate(pickable, ...beside()));
      hotspots.append(button);
      return { pickable, button };
    });
  };

  const activate = (pickable: Pickable, x: number, y: number) => {
    if (pickable.kind === 'tent' && world.level === 'camp') {
      close();
      world.enterTent();
      return;
    }
    world.setHighlight(pickable.id);
    open(pickable, x, y, true);
  };

  const setLevel = (next: Level | null) => {
    level = next;
    close();
    root.dataset.level = next ?? '';
    marker.hidden = next !== 'landscape';
    exit.hidden = next !== 'tent';
    if (next === 'landscape' && 'person' in world.route) {
      go.href = `/gear/${world.route.person}/camp/`;
      go.textContent = `Go to ${personName()}’s campsite`;
    }
    hint.textContent = next ? HINTS[touch.matches ? 'touch' : 'fine'][next] : '';
    hint.hidden = !hint.textContent || hinted.has(next!);
    buildSpots();
    layout();
  };

  /**
   * Whether the page itself covers a point: anything of the page's own (the
   * panel, the tabs, the header, the footer) sitting over the scene there.
   * Only the page's see-through containers count as open.
   */
  const OPEN = new Set(['HTML', 'BODY']);
  const isOpen = (node: Element) => OPEN.has(node.tagName) || node.matches('main, .g-page, .person, .stage, .wrap');
  const coveredAt = (x: number, y: number) => {
    for (const node of document.elementsFromPoint(x, y)) {
      if (root.contains(node)) continue;
      return !isOpen(node);
    }
    return false;
  };
  /** Covered at a point, or within `margin` pixels of it (so a dot hides before it laps onto the page). */
  const covered = () => (x: number, y: number, margin = 0) =>
    coveredAt(x, y) ||
    (margin > 0 && (coveredAt(x - margin, y) || coveredAt(x + margin, y) || coveredAt(x, y - margin) || coveredAt(x, y + margin)));
  const offScreen = (x: number, y: number) => x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight;

  /** Each frame: keep the marker and hotspots over what they point at, and the foot under the shot. */
  /** Each hotspot this frame: the tip of its thing on screen (tx, ty), and where its dot goes (x, y). */
  const points: { button: HTMLButtonElement; tx: number; ty: number; x: number; y: number; off: boolean }[] = [];
  /** Hotspot size for how big the camp is on screen: full size up close (and in the tent), down to 60% from afar. */
  const spotScale = () => {
    const point = world.campPoint;
    if (!point) return 1;
    const a = world.toScreen(point);
    const b = world.toScreen(point.clone().setY(point.y - 1));
    if (a.behind || b.behind) return 1;
    // About 85 px a metre at the campsite's opening distance.
    return Math.min(1, Math.max(0.6, Math.hypot(a.x - b.x, a.y - b.y) / 85));
  };

  const layout = () => {
    if (!level) return;
    const under = covered();
    if (level === 'landscape') {
      const point = world.campPoint;
      if (point) {
        world.toScreen(point, screen);
        marker.style.transform = `translate(${Math.round(screen.x)}px, ${Math.round(screen.y)}px)`;
        marker.classList.toggle('is-off', screen.behind || offScreen(screen.x, screen.y) || under(screen.x, screen.y));
      }
    }
    points.length = 0;
    // Each dot sits just above its thing (below, for a mat under a bag), on a stem down to it, so it never hides it.
    // Zoomed out, the camp is small on screen: its dots shrink to suit and sit closer.
    const scale = spotScale();
    const lift = LIFT * scale;
    const spread = SPREAD * scale;
    for (const { pickable, button } of spots) {
      world.toScreen(pickable.tip, screen);
      const tx = screen.x;
      const ty = screen.y;
      const y = ty + (pickable.pin === 'below' ? lift : -lift);
      const off = screen.behind || offScreen(tx, y) || under(tx, y, 12) || under(tx, ty);
      points.push({ button, tx, ty, x: tx, y, off });
    }
    // Things side by side (a stove and its water) would stack their hotspots: ease them apart.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i];
          const b = points[j];
          if (a.off || b.off) continue;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d >= spread) continue;
          const [ux, uy] = d > 0.5 ? [(b.x - a.x) / d, (b.y - a.y) / d] : [0, 1];
          const push = (spread - d) / 2;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
    for (const { button, tx, ty, x, y, off } of points) {
      button.classList.toggle('is-off', off);
      const rx = Math.round(x);
      const ry = Math.round(y);
      button.style.transform = `translate(${rx}px, ${ry}px)`;
      // The stem runs from the dot's centre to the thing, slanting if the dot was nudged aside.
      const dx = tx - rx;
      const dy = ty - ry;
      button.style.setProperty('--stem', `${Math.hypot(dx, dy).toFixed(1)}px`);
      button.style.setProperty('--tilt', `${Math.atan2(-dx, dy).toFixed(3)}rad`);
      button.style.setProperty('--s', scale.toFixed(3));
    }
    // The foot: centred under the shot, at the bottom of the stage or the screen, whichever is higher...
    const stage = document.querySelector<HTMLElement>('[data-stage]');
    let bottom = Math.min(stage ? stage.getBoundingClientRect().bottom : Infinity, window.innerHeight) - 16;
    const x = world.rig.frameAt.x * window.innerWidth;
    // ...unless the landscape's marker sits there (camps can lie low in a tall frame): then just above it.
    if (level === 'landscape' && !marker.classList.contains('is-off')) {
      const m = marker.getBoundingClientRect();
      const half = foot.offsetWidth / 2;
      const across = x + half > m.left - 8 && x - half < m.right + 8;
      if (across && bottom > m.top - 8 && bottom - foot.offsetHeight < m.bottom + 8) bottom = m.top - 12;
    }
    foot.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(bottom, 120))}px) translate(-50%, -100%)`;
  };

  world.onLevel(setLevel);
  world.onRender(layout);
  setLevel(world.level);
  // Scrolling moves the page over the scene without drawing a frame: keep up with it.
  let queued = 0;
  const relayout = () => {
    if (!queued) queued = requestAnimationFrame(() => ((queued = 0), layout()));
  };
  window.addEventListener('scroll', relayout, { passive: true });
  window.addEventListener('resize', relayout);

  return {
    hover(pickable, x, y) {
      if (pinned) return;
      if (pickable) open(pickable, x, y, false);
      else if (shownFor) close();
    },
    activate,
    dismiss() {
      if (card.hidden) return false;
      close();
      return true;
    },
    used() {
      if (!level || hinted.has(level)) return;
      hinted.add(level);
      hint.hidden = true;
    },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
