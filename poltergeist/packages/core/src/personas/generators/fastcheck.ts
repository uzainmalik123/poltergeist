import fc from 'fast-check';
import { mix32 } from './mix.js';

const ARBITRARY = fc.string({ unit: 'grapheme', maxLength: 64 });

/** One seeded fast-check sample. fast-check is pinned exactly, so the values only change on a deliberate bump. */
export function fastcheckValue(seed: number, index: number): string {
  return fc.sample(ARBITRARY, { seed: mix32((seed ^ mix32(index)) >>> 0) | 0, numRuns: 1 })[0]!;
}
