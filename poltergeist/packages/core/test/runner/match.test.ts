import { describe, expect, it } from 'vitest';
import type { HauntingPlan } from '../../src/compiler/dsl.js';
import {
  blockAction,
  conflictKeys,
  evalJsonPath,
  pathMatches,
  planIdentity,
  requestMatches,
} from '../../src/runner/match.js';
import { pairSeed } from '../../src/runner/seed.js';
import type { BlockedRequest } from '../../src/safety/guard.js';

const plan = (over: Partial<HauntingPlan>): HauntingPlan => ({
  criterion: '1.1',
  persona: 'wraith',
  intent: 'x',
  routes: [{ path: '/claims', identity: 'default' }],
  actors: { a: [] },
  assert: [{ noConsoleErrors: true }],
  ...over,
});

describe('pairSeed', () => {
  it('is stable for the same inputs', () => {
    expect(pairSeed(1031, '1.1', 'wraith')).toBe(pairSeed(1031, '1.1', 'wraith'));
  });

  it('differs by criterion, persona and run seed', () => {
    const base = pairSeed(1031, '1.1', 'wraith');
    expect(pairSeed(1031, '1.2', 'wraith')).not.toBe(base);
    expect(pairSeed(1031, '1.1', 'banshee')).not.toBe(base);
    expect(pairSeed(7, '1.1', 'wraith')).not.toBe(base);
  });

  it('returns a uint32', () => {
    const s = pairSeed(0, 'a', 'b');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });

  it('rejects a run seed that is not a uint32', () => {
    expect(() => pairSeed(-1, 'a', 'b')).toThrow(RangeError);
    expect(() => pairSeed(1.5, 'a', 'b')).toThrow(RangeError);
    expect(() => pairSeed(2 ** 32, 'a', 'b')).toThrow(RangeError);
  });
});

describe('evalJsonPath', () => {
  it('reads keys, indexes and length', () => {
    expect(evalJsonPath({ claims: [1, 2] }, '$.claims.length')).toEqual({ found: true, value: 2 });
    expect(evalJsonPath({ a: [{}, { b: 'x' }] }, '$.a[1].b')).toEqual({ found: true, value: 'x' });
    expect(evalJsonPath({ s: 'abc' }, '$.s.length')).toEqual({ found: true, value: 3 });
  });

  it('returns the whole value for $', () => {
    expect(evalJsonPath({ a: 1 }, '$')).toEqual({ found: true, value: { a: 1 } });
  });

  it('reports a missing path', () => {
    expect(evalJsonPath({ a: 1 }, '$.missing').found).toBe(false);
    expect(evalJsonPath({ a: [1] }, '$.a[3]').found).toBe(false);
    expect(evalJsonPath(null, '$.a').found).toBe(false);
  });

  it('rejects unsupported syntax', () => {
    for (const p of ['claims', '$..a', "$['a']", '$.a[-1]', '$.a.']) {
      const r = evalJsonPath({ a: 1 }, p);
      expect(r.found).toBe(false);
      if (!r.found) expect(r.error).toMatch(/unsupported/);
    }
  });

  it('does not read inherited properties', () => {
    expect(evalJsonPath({}, '$.constructor').found).toBe(false);
  });
});

describe('pathMatches', () => {
  it('matches exactly without a wildcard', () => {
    expect(pathMatches('/market', '/market')).toBe(true);
    expect(pathMatches('/market', '/market/x')).toBe(false);
  });

  it('treats * as any characters', () => {
    expect(pathMatches('/trade/*', '/trade/new')).toBe(true);
    expect(pathMatches('/a*c', '/abc')).toBe(true);
  });

  it('escapes regex metacharacters', () => {
    expect(pathMatches('/a.c', '/abc')).toBe(false);
    expect(pathMatches('/a+(b)', '/a+(b)')).toBe(true);
  });
});

describe('requestMatches', () => {
  const origin = 'http://127.0.0.1:4000';
  it('matches method and exact pathname on the origin, ignoring the query', () => {
    expect(requestMatches('POST /api/claims', 'POST', `${origin}/api/claims?x=1`, origin)).toBe(true);
  });

  it('rejects another method, origin or path', () => {
    expect(requestMatches('POST /api/claims', 'GET', `${origin}/api/claims`, origin)).toBe(false);
    expect(requestMatches('POST /api/claims', 'POST', 'http://evil.test/api/claims', origin)).toBe(false);
    expect(requestMatches('POST /api/claims', 'POST', `${origin}/api/claims/2`, origin)).toBe(false);
  });
});

describe('conflictKeys', () => {
  it('keys click targets by the last goto', () => {
    const p = plan({ actors: { a: [{ goto: '/claims' }, { click: { role: 'button', name: 'Claim' } }] } });
    expect(conflictKeys(p)).toEqual(['/claims|{"role":"button","name":"Claim"}']);
  });

  it('falls back to the first route without a goto', () => {
    const p = plan({ routes: [{ path: '/form', identity: 'anonymous' }], actors: { a: [{ dblclick: { text: 'Go' } }] } });
    expect(conflictKeys(p)).toEqual(['/form|{"text":"Go"}']);
  });

  it('counts fill targets, dedupes, and ignores other steps', () => {
    const p = plan({
      actors: {
        a: [
          { goto: '/claims' },
          { fill: { target: { label: 'Note' }, input: { generator: 'plain' } } },
          { press: 'Enter' },
          { wait: 10 },
        ],
        b: [{ goto: '/claims' }, { fill: { target: { label: 'Note' }, input: { generator: 'plain' } } }],
      },
    });
    expect(conflictKeys(p)).toEqual(['/claims|{"label":"Note"}']);
  });
});

describe('planIdentity', () => {
  it('is anonymous when every route is anonymous', () => {
    expect(planIdentity(plan({ routes: [{ path: '/', identity: 'anonymous' }] }))).toEqual({ identity: 'anonymous' });
  });

  it('uses the first account', () => {
    const routes = [{ path: '/', identity: 'anonymous' }, { path: '/claims', identity: 'default' }];
    expect(planIdentity(plan({ routes }))).toEqual({ identity: 'default' });
  });

  it('refuses two accounts', () => {
    const routes = [{ path: '/a', identity: 'default' }, { path: '/b', identity: 'other' }];
    const r = planIdentity(plan({ routes }));
    expect('error' in r && r.error).toMatch(/two accounts/);
  });
});

describe('blockAction', () => {
  const b = (reason: BlockedRequest['reason']): BlockedRequest => ({ url: 'http://x/', host: 'x', method: 'GET', resourceType: 'fetch', reason });
  it('maps reasons to actions', () => {
    expect(blockAction(b('leak'))).toBe('abort-run');
    expect(blockAction(b('forbidden'))).toBe('blocked-by-rule');
    expect(blockAction(b('host'))).toBe('record');
    expect(blockAction(b('scheme'))).toBe('record');
    expect(blockAction(b('redirect'))).toBe('record');
  });
});
