// The biome each person's 3D camp is set in. The ids are shared by the camps
// collection (src/content/camps/<person>.yaml) and the 3D world's presets.
// Camps are imagined moods, not real trips.
export const biomeIds = ['alpine-aurora', 'maple-autumn', 'coast-sunset', 'rockies-night'] as const;
export type BiomeId = (typeof biomeIds)[number];
