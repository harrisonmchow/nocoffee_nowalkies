import GUI from 'three/addons/libs/lil-gui.module.min.js';
import type { WorldRoute } from './route';
import { TERRAIN_VIEWS, type TerrainView } from './scene/terrain';
import type { World } from './World';

/** The terrain's field views, then the cloud layer's. */
const VIEWS = [...TERRAIN_VIEWS, 'cloud density', 'cloud pointer'] as const;

const describe = (route: WorldRoute) =>
  'person' in route && route.person ? `${route.level}: ${route.person}` : route.level;

/** ?debug in dev and test builds: live renderer and Director numbers, the debug views, and a few actions. */
export function mountDebug(world: World) {
  const gui = new GUI({ title: 'World' });
  // Display-only, so every readout is a string.
  const readout = {
    route: '',
    tier: world.quality.tier,
    antialias: String(world.quality.antialias),
    pixelRatio: '',
    buffer: '',
    calls: '',
    triangles: '',
    programs: '',
    time: '',
    camp: '',
    director: '',
  };
  const keys = Object.keys(readout) as (keyof typeof readout)[];
  keys.forEach((key) => gui.add(readout, key).disable());
  gui.add({ render: () => world.render() }, 'render').name('Draw a frame');
  gui
    .add({ view: 'final' }, 'view', VIEWS)
    .name('View')
    .onChange((view: string) => {
      world.setView(view.startsWith('cloud') ? 'final' : (view as TerrainView));
      if (view === 'cloud density') world.setCloudView('density');
      if (view === 'cloud pointer') world.setCloudView('pointer');
    });

  const refresh = () => {
    const { renderer } = world;
    const canvas = renderer.domElement;
    readout.route = describe(world.route);
    readout.pixelRatio = String(renderer.getPixelRatio());
    readout.buffer = `${canvas.width} × ${canvas.height}`;
    readout.calls = String(renderer.info.render.calls);
    readout.triangles = String(renderer.info.render.triangles);
    readout.programs = String(renderer.info.programs?.length ?? 0);
    readout.time = world.clock.elapsed.toFixed(2);
    readout.camp = world.shownBiome ?? 'none';
    const d = world.director;
    readout.director = `${d.phase} · limbo ${d.limbo.toFixed(2)} · paper ${d.paper.toFixed(2)}`;
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  };
  world.onRender(refresh);
  refresh();
}
