import { BackSide, Mesh, ShaderMaterial, SphereGeometry, type PerspectiveCamera } from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';

/**
 * The sky dome: gradient, sun or moon, stars, Milky Way and aurora, all from
 * wSky() in shaders/chunks.ts, and the cloud layer wherever no ground stands
 * in front of it. It follows the camera (no false parallax) and draws first,
 * behind everything.
 */
export function createSky(uniforms: WorldUniforms, starLayers: number) {
  const material = new ShaderMaterial({
    name: 'world-sky',
    uniforms: pickUniforms(uniforms, [...SKY_KEYS, 'uDebugView'] as const),
    defines: { STAR_LAYERS: starLayers },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WORLD_ALL}
      uniform float uDebugView;
      varying vec3 vDir;
      void main() {
        vec3 D = normalize(vDir);
        vec4 cloud = wCloudAlong(D, 1e7);
        gl_FragColor = vec4(mix(wSky(D, uPixelAngle), cloud.rgb, cloud.a), 1.0);
        #include <tonemapping_fragment>
        gl_FragColor.rgb = wGrade(gl_FragColor.rgb);
        #include <colorspace_fragment>
        if (uDebugView > 7.5) gl_FragColor = vec4(wCloudDebug(D, uDebugView), 1.0);
      }
    `,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new Mesh(new SphereGeometry(1, 64, 32), material);
  mesh.name = 'sky';
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(camera: PerspectiveCamera) {
      mesh.position.copy(camera.position);
      mesh.scale.setScalar(camera.far * 0.5);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
