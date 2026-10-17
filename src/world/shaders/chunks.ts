// GLSL shared by every world material. The sky, the terrain haze, the clouds
// and the ice all read the same sky uniforms, so haze always matches the sky
// behind it (threejs-atmosphere-aerial-perspective: one sun, one set of
// coefficients). Function names start with `w` to stay clear of three's own.

/** Uniform declarations. Every name here has a matching entry in systems/uniforms.ts. */
export const WORLD_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform float uPixelAngle;

uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
uniform float uSkySharpness;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDisc;
uniform float uSunDiscGain;
uniform float uSunGlow;
uniform float uStars;
uniform float uMilkyWay;
uniform vec3 uGalPole;
uniform vec3 uGalCore;
uniform float uAurora;
uniform float uAuroraYaw;
uniform sampler2D tAurora;
uniform sampler2D tNoise;

uniform float uHazeDensity;
uniform float uHazeFalloff;
uniform float uHazeBase;
uniform float uHazeCap;

uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uLimbo;
uniform float uPaper;
uniform vec3 uPaperColor;
`;

export const WORLD_NOISE = /* glsl */ `
float wHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 wHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
`;

// Stars on a cube-face lattice, one candidate per cell, flux-conserving and
// filtered by the pixel footprint so they don't shimmer
// (threejs-raymarched-space-effects, lensed-celestial-spheres, without lensing).
export const WORLD_SKY = /* glsl */ `
const float W_STAR_RADIUS = 0.00030;

vec3 wBlackbody(float T) {
  float t = clamp(T, 1700.0, 30000.0) * 0.01;
  float r, g, b;
  if (t <= 66.0) { r = 255.0; g = 99.4708025861 * log(t) - 161.1195681661; }
  else { r = 329.698727446 * pow(t - 60.0, -0.1332047592); g = 288.1221695283 * pow(t - 60.0, -0.0755148492); }
  if (t >= 66.0) b = 255.0;
  else if (t <= 19.0) b = 0.0;
  else b = 138.5177312231 * log(t - 10.0) - 305.0447927307;
  vec3 c = clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);
  return c / max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
}

vec3 wFaceDir(float face, vec2 uv) {
  vec3 v;
  if (face < 1.5) v = vec3(1.0, uv.x, uv.y);
  else if (face < 3.5) v = vec3(uv.x, 1.0, uv.y);
  else v = vec3(uv.x, uv.y, 1.0);
  return normalize((mod(face, 2.0) < 0.5 ? 1.0 : -1.0) * v);
}

// One star layer. wide = 1 checks the 3x3 neighbouring cells (bright stars
// whose glow crosses cell edges); wide = 0 checks only the pixel's own cell.
vec3 wStarLayer(vec3 D, float foot, float cells, float density, float lum, float seed, int wide) {
  vec3 ad = abs(D);
  float ma = max(ad.x, max(ad.y, ad.z));
  vec2 uv;
  float face;
  if (ma == ad.x) { uv = D.yz / D.x; face = D.x > 0.0 ? 0.0 : 1.0; }
  else if (ma == ad.y) { uv = D.xz / D.y; face = D.y > 0.0 ? 2.0 : 3.0; }
  else { uv = D.xy / D.z; face = D.z > 0.0 ? 4.0 : 5.0; }

  float cellAng = 1.0 / cells;
  float s = clamp(max(W_STAR_RADIUS, 0.62 * foot), W_STAR_RADIUS, 0.5 * cellAng);
  float k = (W_STAR_RADIUS * W_STAR_RADIUS) / (s * s);
  float i2 = 1.0 / (s * s);
  vec2 gi = floor(uv * cells);
  vec3 sum = vec3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      if (wide == 0 && (i != 0 || j != 0)) continue;
      vec2 cell = gi + vec2(float(i), float(j));
      vec3 h = wHash33(vec3(cell, face * 17.0 + seed));
      if (h.z > density) continue;
      vec3 sd = wFaceDir(face, (cell + h.xy) * cellAng);
      vec3 dp = D - sd;
      float d2 = dot(dp, dp);
      vec3 h2 = wHash33(vec3(cell + 91.7, face * 17.0 + seed + 5.0));
      float u = max(h2.x, 0.0016);
      float flux = lum * pow(u, -0.6666667);
      float I = flux * k * exp(-0.5 * d2 * i2);
      if (I < 2.0e-4) continue;
      float ts = clamp(0.62 * pow(h2.y, 6.5) + 0.38 * (1.0 - pow(u, 0.30)), 0.0, 1.0);
      vec3 cc = wBlackbody(mix(2700.0, 24000.0, ts));
      sum += I * mix(vec3(1.0), cc, clamp(0.35 + 0.55 * log2(1.0 + flux * 6.0), 0.35, 1.0));
    }
  }
  // Past one cell per pixel, fall back to the layer's mean radiance.
  vec3 meanRad = vec3(0.98, 0.96, 1.0) * (density * lum * 2.9 * 6.2831853 * W_STAR_RADIUS * W_STAR_RADIUS * cells * cells);
  return mix(sum, meanRad, smoothstep(0.30, 1.25, foot * cells));
}

// The Milky Way from the noise texture in galactic coordinates: a band, a
// warm bulge toward the core and dust lanes carved out of it.
vec3 wMilkyWay(vec3 D) {
  float sb = dot(D, uGalPole);
  vec3 e2 = cross(uGalPole, uGalCore);
  float lon = atan(dot(D, e2), dot(D, uGalCore));
  vec2 uv = vec2(lon / 6.2831853 + 0.5, sb * 0.5 + 0.5);
  float band = exp(-0.5 * sb * sb / (0.08 * 0.08));
  float bulge = pow(max(dot(D, uGalCore), 0.0), 20.0) * exp(-0.5 * sb * sb / (0.1 * 0.1));
  vec4 n1 = textureLod(tNoise, uv * vec2(3.0, 1.5), 0.0);
  vec4 n2 = textureLod(tNoise, uv * vec2(9.0, 4.5) + 0.37, 0.0);
  float clump = 0.35 + 1.1 * n1.r * n2.g;
  float dust = smoothstep(0.5, 0.82, 0.55 * n2.b + 0.55 * n1.g) * exp(-0.5 * sb * sb / (0.035 * 0.035));
  vec3 col = mix(vec3(0.62, 0.7, 1.0), vec3(1.0, 0.86, 0.66), clamp(bulge * 2.0 + clump - 1.1, 0.0, 1.0));
  return col * (band * clump + bulge * 1.3) * (1.0 - 0.85 * dust) * 0.035;
}

// The aurora, from the sky texture that scene/aurora.ts redraws each frame.
vec3 wAuroraSky(vec3 D) {
  float az = atan(D.z, D.x) + uAuroraYaw;
  float el = asin(clamp(D.y, 0.0, 1.0));
  vec2 uv = vec2(fract(az / 6.2831853), el / 1.2217);
  // The map stops at 70 degrees; fade out above it rather than smear its top row.
  return textureLod(tAurora, uv, 0.0).rgb * (1.0 - smoothstep(0.92, 1.0, uv.y));
}

// Sky gradient plus the forward glow around the sun or moon. Haze uses this
// part only, so distant ground fades into the sky colour behind it.
vec3 wSkyBase(vec3 D) {
  float h = D.y;
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(clamp(h, 0.0, 1.0), uSkySharpness));
  float mu = max(dot(D, uSunDir), 0.0);
  sky += uSunColor * uSunGlow * (0.06 * pow(mu, 6.0) + 0.25 * pow(mu, 48.0));
  return mix(sky, uSkyGround, smoothstep(0.0, -0.12, h));
}

vec3 wSky(vec3 D, float foot) {
  vec3 c = wSkyBase(D);
  float above = smoothstep(-0.02, 0.06, D.y);
  if (above > 0.0) {
    vec3 night = vec3(0.0);
    if (uStars > 0.0) {
      night += wStarLayer(D, foot, 40.0, 0.24, 0.5, 1.0, 1);
      #if STAR_LAYERS > 1
      night += wStarLayer(D, foot, 140.0, 0.14, 0.05, 11.0, 0);
      #endif
      night *= uStars;
    }
    if (uMilkyWay > 0.0) night += wMilkyWay(D) * uMilkyWay;
    // Extinction: stars thin out toward the horizon.
    night *= 0.1 + 0.9 * smoothstep(0.0, 0.25, D.y);
    c += night * above;
    if (uAurora > 0.0) c += wAuroraSky(D) * uAurora * above;
  }
  float chord = length(D - uSunDir);
  float w = max(foot, 1e-4);
  c += uSunColor * uSunDiscGain * (1.0 - smoothstep(uSunDisc - w, uSunDisc + w, chord));
  return c;
}
`;

// Height-dependent haze toward the sky colour along the view ray.
export const WORLD_HAZE = /* glsl */ `
vec3 wHaze(vec3 color, vec3 worldPos) {
  vec3 v = worldPos - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float k = uHazeFalloff;
  float h0 = cameraPosition.y - uHazeBase;
  float h1 = worldPos.y - uHazeBase;
  float dh = h1 - h0;
  float avg = abs(dh) > 0.5 ? (exp(-k * h0) - exp(-k * h1)) / (k * dh) : exp(-k * h0);
  float T = max(exp(-uHazeDensity * dist * max(avg, 0.0)), 1.0 - uHazeCap);
  vec3 haze = wSkyBase(normalize(vec3(dir.x, max(dir.y, 0.02), dir.z)));
  return mix(haze, color, T);
}
`;

// The cloud layer: a slab of cloud whose top is shaped into billows by a
// column field. It isn't drawn as geometry. Every surface shader (terrain,
// props, water) and the sky work out how much cloud lies along their own view
// ray, so mountains fade into it by how deep they stand, the sky behind it
// fills the gaps, and nothing needs sorting.
export const WORLD_CLOUD = /* glsl */ `
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform float uCloudBase;
uniform float uCloudCoverage;
uniform float uCloudSoftness;
uniform float uCloudOpacity;
uniform vec3 uCloudLit;
uniform vec3 uCloudShadow;
uniform float uCloudRim;
uniform float uCloudScale;
uniform vec2 uWind;
uniform vec3 uKeyDir;
uniform sampler2D tPointer;
uniform float uPointerInfluence;
uniform vec2 uCamRight;
uniform vec2 uCamForward;

// The cursor's recent motion at this pixel, as recorded: velocity in xy
// (stored as 0.5 + 0.5v), intensity in z. Fragment shaders only.
vec3 wPointerRaw() {
  vec4 p = texture(tPointer, gl_FragCoord.xy / uResolution);
  return vec3(p.rg * 2.0 - 1.0, p.b);
}

// ...and as much of it as this camp's cloud layer and puffs take.
vec3 wPointer() {
  return wPointerRaw() * uPointerInfluence;
}

// The broad shape, two octaves domain-warped, then eroded by detail
// (threejs-volumetric-clouds: detail erodes shaped masses, it doesn't add).
// footprint is the ground a pixel covers there, in metres: the field is read
// from the matching mip, so distant cloud blurs smoothly instead of aliasing.
float wCloudField(vec2 xz, float footprint) {
  float span = 2600.0 * uCloudScale;
  vec2 q = xz / span;
  float lod = log2(max(footprint / span * 256.0, 1.0));
  vec4 a = textureLod(tNoise, q + uWind * uTime * 0.00010, lod);
  vec4 b = textureLod(tNoise, q * 2.7 + a.rg * 0.22 - uWind * uTime * 0.00017, lod + 1.43);
  // Billows: rounded tops, creased hollows between them.
  float shape = a.r * 0.62 + (1.0 - abs(b.g * 2.0 - 1.0)) * 0.38;
  float detail = textureLod(tNoise, q * 7.3 + uWind * uTime * 0.00033, lod + 2.87).r;
  return shape - (1.0 - shape) * (detail - 0.35) * 0.3;
}

// How far up the slab the cloud stands at xz, 0 (its bottom) to 1 (its top).
// The floor (uCloudBase) never parts, so a sea of cloud has no holes in it.
float wCloudColumn(vec2 xz, float footprint) {
  float edge = 1.0 - uCloudCoverage;
  return mix(uCloudBase, 1.0, smoothstep(edge - uCloudSoftness, edge + uCloudSoftness, wCloudField(xz, footprint)));
}

// The ground one pixel covers at distance t along V, stretched at grazing angles.
float wCloudFootprint(vec3 V, float t) {
  return t * uPixelAngle / max(abs(V.y), 0.03);
}

// Height through the billows, 0 to 1: troughs sit in shadow, tops in the light.
float wCloudLift(float h) {
  return 0.2 + 0.8 * clamp((h - uCloudBase) / max(1.0 - uCloudBase, 0.05), 0.0, 1.0);
}

// The cursor pushes the clouds along its path and thins them where it's been.
vec3 wCloudPush() {
  vec3 ptr = wPointer();
  return vec3((uCamRight * ptr.x + uCamForward * ptr.y) * 320.0, ptr.z);
}

// The cloud along the view ray from the camera (direction V) to a surface at
// distance tEnd: rgb its colour, a its opacity. One secant step finds where
// the ray meets the billow tops from above (like parallax mapping; more steps
// jump between unrelated billows at grazing angles and draw veins), or the
// flat base from below. The opacity comes from how far the ray then travels
// inside before reaching the surface, the density ramping up over the first
// 60 m in so the cloud's edges are soft, plus a thin veil through the whole
// slab that fills the gaps between billows seen edge-on.
vec4 wCloudAlong(vec3 V, float tEnd) {
  float T = max(uCloudThickness, 1.0);
  float bottom = uCloudHeight - 0.5 * T;
  float top = bottom + T;
  vec3 C = cameraPosition;
  if (uCloudOpacity < 0.001 || (C.y >= top && V.y >= 0.0) || (C.y <= bottom && V.y <= 0.0)) return vec4(0.0);
  float vy = sign(V.y) * max(abs(V.y), 1e-4);
  float tTop = (top - C.y) / vy;
  float tBottom = (bottom - C.y) / vy;
  float tIn = max(min(tTop, tBottom), 0.0);
  if (tIn >= tEnd) return vec4(0.0);
  vec3 push = wCloudPush();
  float keep = 1.0 - push.z * 0.6;
  float t = tIn;
  float c = wCloudColumn(C.xz + V.xz * t - push.xy, wCloudFootprint(V, t)) * keep;
  float tExit;
  if (V.y < 0.0) {
    // From above: down to the top of the column below the slab's top, then through to the floor.
    float tc = (bottom + c * T - C.y) / vy;
    if (tc > t + 0.5) {
      t = min(tc, tBottom);
      c = wCloudColumn(C.xz + V.xz * t - push.xy, wCloudFootprint(V, t)) * keep;
    }
    tExit = tBottom;
  } else {
    // From below or inside: up through the column standing here.
    tExit = (bottom + c * T - C.y) / vy;
  }
  float L = max(min(tEnd, tExit) - t, 0.0);
  float s = max(abs(V.y), 0.01);
  float ramp = 60.0;
  float tau = (12.0 / T) * (L * s < ramp ? L * L * s / (2.0 * ramp) : L - ramp / (2.0 * s));
  float alpha = (1.0 - exp(-tau)) * smoothstep(0.0, 0.08, c);
  // (Only a sea of cloud, with a floor, has the veil; scattered clouds leave clear sky between them.)
  float veil = (1.0 - exp(-max(min(tEnd, max(tTop, tBottom)) - tIn, 0.0) / 1500.0)) * step(0.01, uCloudBase);
  alpha = (1.0 - (1.0 - alpha) * (1.0 - veil)) * uCloudOpacity;
  vec3 P = C + V * t;
  float lift = V.y < 0.0 ? wCloudLift(clamp((P.y - bottom) / T, 0.0, 1.0)) : 0.2;
  vec3 col = mix(uCloudShadow, uCloudLit, clamp(uKeyDir.y * 0.5 + 0.5, 0.0, 1.0) * (0.25 + 0.75 * lift));
  // A silver lining on thin cloud toward the sun or moon, and a lift where the cursor has been.
  col += uSunColor * uCloudRim * pow(max(dot(V, uSunDir), 0.0), 6.0) * (1.0 - alpha) * 0.6;
  col += uCloudLit * push.z * 0.12;
  return vec4(wHaze(col, P), alpha);
}

// A surface at worldPos, seen through whatever cloud lies in front of it.
vec3 wCloudFog(vec3 color, vec3 worldPos) {
  vec3 d = worldPos - cameraPosition;
  float len = length(d);
  vec4 cloud = wCloudAlong(d / max(len, 1e-3), len);
  return mix(color, cloud.rgb, cloud.a);
}

// Debug views: 8 shows the column field where the ray meets the slab, 9 the pointer history.
vec3 wCloudDebug(vec3 V, float view) {
  if (view > 8.5) return wPointerRaw() * vec3(0.5, 0.5, 1.0) + vec3(0.5, 0.5, 0.0);
  float T = max(uCloudThickness, 1.0);
  float plane = abs(V.y) < 1e-4 ? 0.0 : ((cameraPosition.y > uCloudHeight ? uCloudHeight + 0.5 * T : uCloudHeight - 0.5 * T) - cameraPosition.y) / V.y;
  if (plane <= 0.0) return vec3(0.0, 0.0, 0.25);
  vec3 push = wCloudPush();
  float c = wCloudColumn(cameraPosition.xz + V.xz * plane - push.xy, wCloudFootprint(V, plane));
  return vec3((c - uCloudBase) / max(1.0 - uCloudBase, 0.05));
}
`;

// After tone mapping, before the sRGB conversion: the biome's grade, the
// desaturation into limbo, and the fade to the page's paper.
export const WORLD_GRADE = /* glsl */ `
vec3 wGrade(vec3 c) {
  c = max(c, 0.0);
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(c, 1.0 / uGamma);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation * (1.0 - uLimbo));
  return mix(c, uPaperColor, uPaper);
}

// For additive layers (flames, embers, glow): fading to paper dims them
// instead of adding paper colour on top.
vec3 wGradeAdditive(vec3 c) {
  c = max(c, 0.0) * uGain;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation * (1.0 - uLimbo));
  return c * (1.0 - uPaper);
}
`;

/** Everything above in dependency order, for materials that need the full set. */
export const WORLD_ALL = WORLD_UNIFORMS + WORLD_NOISE + WORLD_SKY + WORLD_HAZE + WORLD_CLOUD + WORLD_GRADE;
