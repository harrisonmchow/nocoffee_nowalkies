// Off-main-thread terrain and noise generation, so building a biome never
// blocks scrolling or a transition.
import { noiseTexture } from '../systems/noise';
import { buildTile, type TileRequest } from './terrain-tile';

export type WorkerRequest =
  | { id: number; type: 'tile'; request: TileRequest }
  | { id: number; type: 'noise'; size: number; seed: number };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'tile') {
    const tile = buildTile(message.request);
    scope.postMessage({ id: message.id, tile }, [
      tile.positions.buffer,
      tile.normals.buffer,
      tile.fields.buffer,
      tile.indices.buffer,
      tile.heightmap.buffer,
    ]);
  } else {
    const data = noiseTexture(message.size, message.seed);
    scope.postMessage({ id: message.id, data }, [data.buffer]);
  }
};
