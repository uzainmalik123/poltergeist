import { createHash } from 'node:crypto';

/** The run seed when none is given. */
export const DEFAULT_SEED = 1031;

/** The generator seed for one pair. Every rep of the pair uses it, so inputs reproduce (D-06, D-33). */
export function pairSeed(runSeed: number, criterion: string, persona: string): number {
  if (!Number.isInteger(runSeed) || runSeed < 0 || runSeed >= 2 ** 32) {
    throw new RangeError(`seed must be a uint32, got ${runSeed}`);
  }
  return createHash('sha256').update(`${runSeed}\u0000${criterion}\u0000${persona}`).digest().readUInt32BE(0);
}
