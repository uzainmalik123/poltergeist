import { ConfigError, ResetError, type SummonResult } from '@poltergeist/core';
import { describe, expect, it } from 'vitest';
import { exitCodeFor } from '../src/exit.js';

const result = (over: Partial<SummonResult>) => ({ result: { haunted: [], allResetsFailed: false, ...over } as SummonResult });

describe('exitCodeFor', () => {
  it('is 1 when anything is haunted', () => expect(exitCodeFor(result({ haunted: ['3.2'] }))).toBe(1));
  it('is 0 when nothing is haunted', () => expect(exitCodeFor(result({}))).toBe(0));
  it('is 2 when every reset failed, even with haunted criteria', () => expect(exitCodeFor(result({ haunted: ['3.2'], allResetsFailed: true }))).toBe(2));
  it('is 2 for a ConfigError', () => expect(exitCodeFor({ error: new ConfigError([{ path: 'target', message: 'bad' }]) })).toBe(2));
  it('is 2 for a ResetError', () => expect(exitCodeFor({ error: Object.create(ResetError.prototype) })).toBe(2));
  it('is 2 for anything unexpected', () => expect(exitCodeFor({ error: new Error('x') })).toBe(2));
  it('is 130 when aborted', () => expect(exitCodeFor({ error: new DOMException('', 'AbortError'), aborted: true })).toBe(130));
});
