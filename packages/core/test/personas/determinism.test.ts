import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GENERATOR_IDS, generate, listPersonas } from '../../src/index.js';

const SEEDS = [0, 1, 42];
const INDICES = [0, 1, 2, 3, 4];

const cells = GENERATOR_IDS.flatMap((id) => SEEDS.flatMap((seed) => INDICES.map((index) => ({ id, seed, index }))));

/** `long` values are stored as length + hash so the snapshot stays small. */
function show(id: string, v: string): string {
  return id === 'long' ? `len=${v.length} sha256=${createHash('sha256').update(v).digest('hex').slice(0, 16)}` : v;
}

describe('determinism (F04 Done-when)', () => {
  it('produces the snapshotted value for every generator × seed × index', () => {
    const table = Object.fromEntries(cells.map(({ id, seed, index }) => [`${id}/${seed}/${index}`, show(id, generate(id, seed, index))]));
    expect(table).toMatchSnapshot();
  });

  it('gives the same value for the same inputs, for any uint32 seed and index', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...GENERATOR_IDS),
        fc.nat({ max: 2 ** 32 - 1 }),
        fc.nat({ max: 2 ** 32 - 1 }),
        (id, s, i) => generate(id, s, i) === generate(id, s, i),
      ),
    );
  });

  it('does not depend on call order', () => {
    const forward = cells.map(({ id, seed, index }) => generate(id, seed, index));
    const backward = [...cells].reverse().map(({ id, seed, index }) => generate(id, seed, index)).reverse();
    expect(backward).toEqual(forward);
    expect(cells).toHaveLength(120);
  });

  it('is exported from the package index', () => {
    expect(listPersonas()).toHaveLength(3);
  });
});
