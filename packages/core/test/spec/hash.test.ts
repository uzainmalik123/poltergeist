import { describe, expect, it } from 'vitest';
import { criterionHash, normalizeText } from '../../src/spec/index.js';

describe('normalizeText', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeText('  a\n\t b  ')).toBe('a b');
  });

  it('normalizes to NFC', () => {
    expect(normalizeText('é')).toBe('é');
  });
});

describe('criterionHash', () => {
  it('is 12 lowercase hex characters', () => {
    expect(criterionHash('THE X SHALL y.')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('ignores whitespace differences', () => {
    expect(criterionHash('A  b')).toBe(criterionHash('A b'));
  });

  it('keeps case', () => {
    expect(criterionHash('A b')).not.toBe(criterionHash('a b'));
  });
});
