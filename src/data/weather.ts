// The skies the camp can sit under. Chosen like the mountain, and
// remembered on this device. Colours are display colours; `horizon` is
// also the fog colour, so the foot of the mountain dissolves into it.

export type WeatherConfig = {
  id: string;
  name: string;
  /** Fog colour, the sky at the horizon and the flat background. */
  horizon: string;
  /** Sky straight up. Omit for a flat sky (the overcast day). */
  zenith?: string;
  /** Hemisphere light: sky, ground, intensity. */
  ambient: [string, string, number];
  /** The one shadow-casting light: sun or moon. */
  key: [string, number];
  /** Multiply the cloud sprites' opacity. */
  mist: number;
  stars: boolean;
  aurora: boolean;
  /** Dark sky: the stage's overlay text switches to light. */
  dark: boolean;
};

export const weathers: WeatherConfig[] = [
  {
    id: 'day',
    name: 'Day',
    horizon: '#dcd9d2',
    ambient: ['#eeebe4', '#6f6a62', 1.5],
    key: ['#ffeedd', 1.8],
    mist: 1,
    stars: false,
    aurora: false,
    dark: false,
  },
  {
    id: 'night',
    name: 'Night',
    horizon: '#2f3b4f',
    zenith: '#0b111d',
    ambient: ['#6577a0', '#1a1f2a', 1.1],
    key: ['#a8bce0', 0.9],
    mist: 0.6,
    stars: true,
    aurora: false,
    dark: true,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    horizon: '#2c3f4f',
    zenith: '#0a1220',
    ambient: ['#6a95a0', '#182027', 1.2],
    key: ['#a6d2d0', 0.8],
    mist: 0.5,
    stars: true,
    aurora: true,
    dark: true,
  },
];
