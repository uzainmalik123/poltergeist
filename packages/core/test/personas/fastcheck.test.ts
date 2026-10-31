import { describe, expect, it } from 'vitest';
import { generate } from '../../src/personas/index.js';

const graphemes = (v: string): number => [...new Intl.Segmenter().segment(v)].length;

describe("generate('fastcheck')", () => {
  it('is the same for the same seed and index', () => {
    for (const [s, i] of [[0, 0], [1, 3], [42, 7], [2 ** 32 - 1, 2 ** 32 - 1]] as const) {
      expect(generate('fastcheck', s, i)).toBe(generate('fastcheck', s, i));
    }
  });

  it('has at most 64 graphemes', () => {
    for (let i = 0; i < 50; i++) expect(graphemes(generate('fastcheck', 9, i))).toBeLessThanOrEqual(64);
  });

  it('varies with the index', () => {
    const vs = Array.from({ length: 20 }, (_, i) => generate('fastcheck', 1, i));
    expect(new Set(vs).size).toBeGreaterThanOrEqual(10);
  });

  it('varies with the seed', () => {
    expect(generate('fastcheck', 1, 0)).not.toBe(generate('fastcheck', 2, 0));
  });
});
