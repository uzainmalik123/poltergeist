import { describe, expect, it } from 'vitest';
import { newRunId } from '../../src/summon/run-id.js';

describe('newRunId', () => {
  it('is a UTC timestamp plus four hex digits', () => {
    expect(newRunId(new Date('2026-11-01T09:08:07Z'), () => 0.5)).toBe('20261101-090807-8000');
  });
  it('defaults to now and Math.random', () => expect(newRunId()).toMatch(/^\d{8}-\d{6}-[0-9a-f]{4}$/));
});
