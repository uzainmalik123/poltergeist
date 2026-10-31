import { describe, expect, it } from 'vitest';
import { REDACTED, Redactor } from '../../src/config/redact.js';

describe('Redactor', () => {
  it('replaces every occurrence of a secret', () => {
    expect(new Redactor(['hunter22']).redact('pw=hunter22 again hunter22')).toBe(`pw=${REDACTED} again ${REDACTED}`);
    expect(REDACTED).toBe('[REDACTED]');
  });

  it('also replaces the percent-encoded form', () => {
    expect(new Redactor(['p@ss w/rd']).redact('?p=p%40ss%20w%2Frd')).toBe('?p=[REDACTED]');
  });

  it('replaces longer secrets first', () => {
    expect(new Redactor(['ab', 'abcd']).redact('abcd ab')).toBe('[REDACTED] [REDACTED]');
  });

  it('treats secrets literally, not as patterns', () => {
    expect(new Redactor(['a.b*']).redact('axb a.b*')).toBe('axb [REDACTED]');
  });

  it('redacts short secrets too', () => {
    expect(new Redactor(['abc']).redact('xabcx')).toBe('x[REDACTED]x');
  });

  it('ignores empty secrets', () => {
    const r = new Redactor(['']);
    expect(r.size).toBe(0);
    expect(r.redact('x')).toBe('x');
  });
});
