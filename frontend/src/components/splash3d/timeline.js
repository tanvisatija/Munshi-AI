// "Growth Ascension" timeline, in seconds from the first rendered 3D frame.
// Kept free of three.js imports so the wrapper can read it without loading the 3D chunk.
export const T = {
  barStart: 0.15, // first bar starts rising
  barGap: 0.08, // stagger between bars
  barRise: 0.55, // each bar's rise time
  dissolveStart: 1.2, // bars start shrinking into particles
  dissolveEnd: 1.75,
  particleFadeIn: 1.15,
  particleArrive: 2.05, // particles reach the logo outline
  particleFadeOut: [1.95, 2.35],
  logoIn: 1.7, // logo appears and starts its full turn
  logoScaleEnd: 2.2,
  logoSpinEnd: 2.6, // logo faces the camera and settles
  wordmarkAt: 2.3, // "Munshi AI" fades in beside the logo
  cameraDolly: 3.2, // slow dolly-in across the whole sequence
};

/** Scene fades to flat navy at this point (ms after the first 3D frame). */
export const FLAT_NAVY_AT_MS = 2850;
/** Cross-fade from flat navy into the app starts here. Tune total length with these two. */
export const LEAVE_AT_MS = 3200;
/** Cross-fade length into the dashboard. Total splash is LEAVE_AT_MS + this (about 3.6 s, plus ~0.4 s to load the 3D chunk). */
export const CROSS_FADE_MS = 400;
/** If the 3D chunk or first frame isn't ready by now, fall back to the 2D splash. */
export const LOAD_TIMEOUT_MS = 1600;
