// Talks to the terrain worker, falling back to the main thread if a module
// worker can't start.
import { noiseTexture } from '../systems/noise';
import { buildTile, type TileData, type TileRequest } from './terrain-tile';

type Reply = { id: number; tile?: TileData; data?: Uint8Array };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (reply: Reply) => void>();

function terrainWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const resolve = pending.get(event.data.id);
      pending.delete(event.data.id);
      resolve?.(event.data);
    };
    worker.onerror = () => {
      // Fall back for anything still waiting, and for every later request.
      worker?.terminate();
      worker = null;
      pending.forEach((resolve, id) => resolve({ id }));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function ask(message: Record<string, unknown>): Promise<Reply> {
  const target = terrainWorker();
  if (!target) return Promise.resolve({ id: 0 });
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    target.postMessage({ ...message, id });
  });
}

export async function requestTile(request: TileRequest): Promise<TileData> {
  const reply = await ask({ type: 'tile', request });
  return reply.tile ?? buildTile(request);
}

export async function requestNoise(size: number, seed: number): Promise<Uint8Array> {
  const reply = await ask({ type: 'noise', size, seed });
  return reply.data ?? noiseTexture(size, seed);
}
