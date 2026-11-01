import { describe, expect, it } from 'vitest';
import {
  GENERATOR_IDS,
  UnknownGeneratorError,
  generate,
  listGenerators,
} from '../../src/personas/index.js';
import { mix32 } from '../../src/personas/generators/mix.js';

const THEME_WORDS = [
  'ghost', 'haunt', 'spirit', 'spook', 'poltergeist', 'wraith', 'banshee', 'doppel', 'lich',
  'revenant', 'changeling', 'possess', 'exorcis', 'seance', 'séance', 'curse', 'undead',
];

/** Values for indices 0..n-1 from one seed. */
function values(id: string, seed: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => generate(id, seed, i));
}

/** Length of a list generator: the first index whose value repeats index 0's (it wraps). */
function cycleLength(id: string, seed: number): number {
  const first = generate(id, seed, 0);
  for (let i = 1; i < 1000; i++) if (generate(id, seed, i) === first) return i;
  throw new Error(`${id} did not wrap`);
}

describe('generate: list generators', () => {
  it('empty is always the empty string', () => {
    for (const [s, i] of [[0, 0], [1, 5], [42, 99]] as const) expect(generate('empty', s, i)).toBe('');
  });

  it('plain is a short lowercase word plus four digits', () => {
    const vs = values('plain', 7, 16);
    for (const v of vs) expect(v).toMatch(/^[a-z]+\d{4}$/);
    expect(new Set(vs).size).toBeGreaterThanOrEqual(8);
  });

  it('long is exactly 10,000 alphanumeric characters', () => {
    for (const i of [0, 1, 2]) {
      const v = generate('long', 3, i);
      expect(v.length).toBe(10_000);
      expect(v).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('whitespace values are non-empty and whitespace only', () => {
    const vs = values('whitespace', 0, 21);
    for (const v of vs) {
      expect(v.length).toBeGreaterThan(0);
      expect(v).toMatch(/^[\s\u200B]+$/u);
    }
    for (const ch of ['\t', '\u00A0', '\u200B', '\u3000']) expect(vs).toContain(ch);
  });

  it('emoji covers ZWJ, skin tone, flag, keycap and mixed text', () => {
    const vs = values('emoji', 0, cycleLength('emoji', 0));
    expect(vs.some((v) => /\u200D/.test(v))).toBe(true);
    expect(vs.some((v) => /[\u{1F3FB}-\u{1F3FF}]/u.test(v))).toBe(true);
    expect(vs.some((v) => /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(v))).toBe(true);
    expect(vs.some((v) => /\u20E3/.test(v))).toBe(true);
    expect(vs.some((v) => /[A-Za-z]/.test(v) && /\p{Extended_Pictographic}/u.test(v))).toBe(true);
  });

  it('rtl covers override, Arabic, Hebrew and mixed direction', () => {
    const vs = values('rtl', 0, cycleLength('rtl', 0));
    expect(vs.some((v) => v.includes('\u202E'))).toBe(true);
    expect(vs.some((v) => /[؀-ۿ]/.test(v))).toBe(true);
    expect(vs.some((v) => /[֐-׿]/.test(v))).toBe(true);
    expect(vs.some((v) => /[A-Za-z]/.test(v) && /[֐-ۿ]/.test(v))).toBe(true);
  });

  it.each(['emoji', 'rtl', 'whitespace'])('%s: consecutive indices are distinct until the list wraps', (id) => {
    for (const seed of [0, 1, 42]) {
      const n = cycleLength(id, seed);
      expect(new Set(values(id, seed, n)).size).toBe(n);
      expect(generate(id, seed, n)).toBe(generate(id, seed, 0));
    }
  });
});

describe('generate: errors', () => {
  it.each(['wraith', '__proto__', 'toString', 'Plain', ''])('unknown id %j throws UnknownGeneratorError', (id) => {
    expect(() => generate(id, 0, 0)).toThrow(UnknownGeneratorError);
    try {
      generate(id, 0, 0);
    } catch (e) {
      expect((e as UnknownGeneratorError).id).toBe(id);
    }
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32])('seed %s throws RangeError', (bad) => {
    expect(() => generate('plain', bad, 0)).toThrow(RangeError);
    expect(() => generate('plain', bad, 0)).toThrow(/seed/);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32])('index %s throws RangeError', (bad) => {
    expect(() => generate('plain', 0, bad)).toThrow(RangeError);
    expect(() => generate('plain', 0, bad)).toThrow(/index/);
  });

  it('accepts the uint32 bounds', () => {
    expect(() => generate('plain', 2 ** 32 - 1, 2 ** 32 - 1)).not.toThrow();
  });
});

describe('listGenerators', () => {
  it('lists every generator in order with a plain-QA description', () => {
    const list = listGenerators();
    expect(list.map((g) => g.id)).toEqual([...GENERATOR_IDS]);
    for (const g of list) {
      expect(g.description.length).toBeGreaterThan(0);
      const lower = g.description.toLowerCase();
      for (const w of THEME_WORDS) expect(lower).not.toContain(w);
    }
  });

  it('is frozen', () => {
    const list = listGenerators();
    expect(Object.isFrozen(list)).toBe(true);
    for (const g of list) expect(Object.isFrozen(g)).toBe(true);
  });
});

describe('mix32', () => {
  it('returns a uint32 and separates neighbours', () => {
    expect(mix32(0)).not.toBe(mix32(1));
    for (const x of [0, 1, 2, 42, 2 ** 31, 2 ** 32 - 1]) {
      const m = mix32(x);
      expect(Number.isInteger(m)).toBe(true);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(2 ** 32);
    }
  });
});
