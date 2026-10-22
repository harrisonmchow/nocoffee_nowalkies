// A snow leopard at the edge of Kevin's camp, the one model at camp that isn't
// built in code: "Snow leopard by Poly by Google [CC-BY]
// (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza
// (https://poly.pizza/m/26tTvxyxkPC)", credited on /credits. The GLB is the
// Poly Pizza download repacked: the same mesh (about 1k triangles, standing,
// facing +z, paws at y 0), its 2048² PNG as a 1024² WebP. It's in the world's
// own prop material so the night, the haze and the fire light it like the rest
// of the camp; no snow settles on it, since it's alive. Not something you can
// point at: it isn't anyone's kit.
import { Mesh, Object3D, type MeshStandardMaterial, type Texture } from 'three';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';

/** The model is about 6.3 units nose to rump; a snow leopard is about 1 m, and 0.6 m at the shoulder. */
const SCALE = 0.16;
/** How much paler than painted its coat is drawn (see below). */
const COAT_LIFT = 1.8;

const URL_GLB = new URL('../../assets/3d/snow-leopard.glb', import.meta.url).href;

/** Load the leopard. Null if it can't be had: the camp goes on without it. */
export async function createSnowLeopard(uniforms: WorldUniforms, starLayers: number) {
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(URL_GLB);
    let source: Mesh | undefined;
    gltf.scene.traverse((o) => {
      if ((o as Mesh).isMesh) source = o as Mesh;
    });
    if (!source) throw new Error('no mesh');
    const loaded = source.material as MeshStandardMaterial;
    const map = loaded.map as Texture;
    loaded.dispose();
    const material = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.95 });
    material.map = map;
    // Its coat is painted a mid khaki-grey (about 0.19 albedo), which the night
    // grades down to a black cat; lifted, it reads as the pale snow leopard it is.
    material.color.setScalar(COAT_LIFT);
    const mesh = new Mesh(source.geometry, material);
    mesh.scale.setScalar(SCALE);
    const object = new Object3D();
    object.name = 'snow-leopard';
    object.add(mesh);
    return {
      object,
      dispose() {
        mesh.geometry.dispose();
        map.dispose();
        material.dispose();
      },
    };
  } catch (error) {
    console.warn('snow-leopard: not loaded', error);
    return null;
  }
}
