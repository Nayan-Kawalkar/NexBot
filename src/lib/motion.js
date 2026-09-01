/**
 * One motion vocabulary for the whole experience.
 *
 * Everything that moves — DOM and WebGL alike — pulls its easing and its
 * duration from here, which is what makes a project switch read as a single
 * composition rather than a pile of independently-timed animations.
 */
export const EASE = {
  out: 'power3.out',
  outSoft: 'power2.out',
  outLong: 'expo.out',
  inOut: 'power2.inOut',
  in: 'power2.in',
};

export const DUR = {
  micro: 0.28,
  short: 0.5,
  base: 0.72,
  long: 1.05,
  hero: 1.35,
};

export const STAGGER = 0.055;

/** Scales a duration down to near-instant when reduced motion is requested. */
export const scaled = (value, reduced) => (reduced ? Math.min(value, 0.2) : value);
