// Random-number helpers for the simulator.

export type Rng = () => number; // returns a number in [0, 1)

// A small, fast random generator. Giving it the same seed replays exactly
// the same "random" games, which is handy for testing.
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

// Bell-curve random number: usually between -2 and 2, centered on 0.
export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// A random multiplier that averages 1. sigma 0.1 means "usually within ~10%".
export function wobble(rng: Rng, sigma: number): number {
  return Math.exp(sigma * normal(rng) - (sigma * sigma) / 2);
}

// Random count of rare events (e.g. interceptions) averaging `mean`.
export function poisson(rng: Rng, mean: number): number {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng();
  while (p > limit) {
    k++;
    p *= rng();
  }
  return k;
}

// Picks an index with chance proportional to its weight; -1 if all are 0.
export function pickWeighted(rng: Rng, weights: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
