/** murmur3 fmix32: a uint32 → uint32 avalanche, so neighbouring seeds land far apart. */
export function mix32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Position in a list of `n`: a seed-chosen offset plus the index, so consecutive indices never repeat until the list wraps. */
export function pickIndex(n: number, seed: number, index: number): number {
  return ((mix32(seed) % n) + (index % n)) % n;
}

/** Seeds and indices are uint32 integers (D-31). */
export function assertUint32(name: 'seed' | 'index', v: number): void {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) {
    throw new RangeError(`${name} must be an integer from 0 to 4294967295, got ${String(v)}`);
  }
}
