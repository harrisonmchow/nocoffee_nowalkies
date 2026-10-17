/** Why the world is or isn't running on this visit. Mirrored to <html data-world>. */
export type WorldMode =
  /** Switched off: the build default until launch, or ?world=off. */
  | 'off'
  /** prefers-reduced-motion is on. The 2D pages show instead. */
  | 'reduced'
  /** The browser asked to save data. */
  | 'save-data'
  /** WebGL2 exists, but only through a software or blocklisted GPU. */
  | 'weak'
  /** No WebGL2 at all. */
  | 'unsupported'
  | 'loading'
  | 'on'
  | 'error';
