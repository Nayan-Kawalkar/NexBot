/**
 * Adaptive render quality.
 *
 * Rather than shipping one workload and hoping, the experience picks a tier up
 * front from what the device tells us, then quietly steps down a tier if the
 * frame budget is being missed. Visual fidelity is the thing we protect
 * longest: resolution and shadow softness give way before materials do.
 */

const isCoarsePointer = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const TIERS = {
  high: {
    name: 'high',
    maxPixelRatio: 2,
    samples: 4,
    shadowMapSize: 2048,
    contactShadowSize: 512,
    contactShadowBlur: 2,
    bloom: true,
    bloomScale: 0.5,
    anisotropy: 8,
  },
  medium: {
    name: 'medium',
    maxPixelRatio: 1.75,
    samples: 4,
    shadowMapSize: 1024,
    contactShadowSize: 384,
    contactShadowBlur: 2,
    bloom: true,
    bloomScale: 0.5,
    anisotropy: 4,
  },
  low: {
    name: 'low',
    maxPixelRatio: 1.5,
    samples: 0,
    shadowMapSize: 1024,
    contactShadowSize: 256,
    contactShadowBlur: 1,
    bloom: true,
    bloomScale: 0.4,
    anisotropy: 2,
  },
};

const ORDER = ['high', 'medium', 'low'];

export function detectTier() {
  if (typeof window === 'undefined') return TIERS.medium;

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4;
  const coarse = isCoarsePointer();
  const area = window.innerWidth * window.innerHeight * Math.min(devicePixelRatio, 2) ** 2;

  // Phones and tablets do the same work over far fewer pixels, so the tier is
  // about sustained GPU headroom rather than raw screen size.
  if (coarse) {
    if (cores >= 6 && memory >= 4) return TIERS.medium;
    return TIERS.low;
  }

  if (cores <= 4 || memory <= 4) return TIERS.medium;
  if (area > 6_000_000 && cores < 8) return TIERS.medium;
  return TIERS.high;
}

export function stepDown(tier) {
  const index = ORDER.indexOf(tier.name);
  if (index < 0 || index === ORDER.length - 1) return tier;
  return TIERS[ORDER[index + 1]];
}

/**
 * Watches frame time over a rolling window and reports once — and only once —
 * that the current tier is too expensive for this machine.
 */
export function createPerformanceGovernor({ onDowngrade, sampleSize = 90, budgetMs = 24 }) {
  let samples = 0;
  let total = 0;
  let settled = false;
  // Ignore the first second: shader compilation and texture upload always spike.
  let warmup = 60;

  return {
    sample(deltaMs) {
      if (settled) return;
      if (warmup > 0) {
        warmup -= 1;
        return;
      }
      total += deltaMs;
      samples += 1;
      if (samples < sampleSize) return;

      const average = total / samples;
      samples = 0;
      total = 0;

      if (average > budgetMs) {
        settled = true;
        onDowngrade(average);
      }
    },
    stop() {
      settled = true;
    },
  };
}
