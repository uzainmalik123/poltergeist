import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cacheKey, personaHash, readCache, writeCache, type CachedResult } from '../../src/compiler/cache.js';
import { getPersona } from '../../src/personas/index.js';

const plan: CachedResult = {
  kind: 'plan',
  plan: {
    criterion: '3.2',
    persona: 'wraith',
    intent: 'Double-click claim.',
    routes: [{ path: '/market', identity: 'default' }],
    actors: { a: [{ goto: '/market' }, { dblclick: { testId: 'claim-sour-skulls' } }] },
    assert: [{ textVisible: 'Claimed' }],
  },
};
const na: CachedResult = { kind: 'notApplicable', reason: 'No input fields.', routes: [{ path: '/market', identity: 'default' }] };

const tmp = () => mkdtemp(join(tmpdir(), 'plan-cache-'));

const base = {
  criterionHash: 'abc123',
  personaId: 'wraith' as const,
  personaHash: personaHash(getPersona('wraith')),
  routes: [
    { path: '/market', identity: 'default', routeHash: 'h1' },
    { path: '/trade/new', identity: 'default', routeHash: 'h2' },
  ],
  model: 'claude-sonnet-5-5',
  promptVersion: 'f05-1',
};

describe('plan cache', () => {
  it('round-trips a plan and a notApplicable', async () => {
    const dir = await tmp();
    await writeCache(dir, 'k1', plan);
    await writeCache(dir, 'k2', na);
    expect(await readCache(dir, 'k1')).toEqual(plan);
    expect(await readCache(dir, 'k2')).toEqual(na);
  });

  it('creates the directory', async () => {
    const dir = join(await tmp(), 'nested', 'plans');
    await writeCache(dir, 'k', plan);
    expect(await readCache(dir, 'k')).toEqual(plan);
  });

  it('missing file → undefined', async () => {
    expect(await readCache(await tmp(), 'nope')).toBeUndefined();
  });

  it('corrupt JSON → undefined', async () => {
    const dir = await tmp();
    await writeFile(join(dir, 'k.json'), '{"kind":"pl');
    expect(await readCache(dir, 'k')).toBeUndefined();
  });

  it('wrong shape → undefined', async () => {
    const dir = await tmp();
    await writeFile(join(dir, 'k.json'), JSON.stringify({ kind: 'plan', plan: { criterion: '1.1' } }));
    expect(await readCache(dir, 'k')).toBeUndefined();
  });

  it('a directory in place of the file → undefined', async () => {
    const dir = await tmp();
    await mkdir(join(dir, 'k.json'));
    expect(await readCache(dir, 'k')).toBeUndefined();
  });
});

describe('cacheKey', () => {
  it('key changes with each input', () => {
    const keys = new Set([
      cacheKey(base),
      cacheKey({ ...base, model: 'claude-opus-5-5' }),
      cacheKey({ ...base, promptVersion: 'f05-2' }),
      cacheKey({ ...base, personaHash: 'other' }),
      cacheKey({ ...base, routes: [{ ...base.routes[0]!, routeHash: 'h9' }, base.routes[1]!] }),
      cacheKey({ ...base, routes: [{ ...base.routes[0]!, path: '/vault' }, base.routes[1]!] }),
      cacheKey({ ...base, criterionHash: 'def456' }),
      cacheKey({ ...base, personaId: 'banshee' }),
    ]);
    expect(keys.size).toBe(8);
  });

  it('key ignores route order', () => {
    expect(cacheKey({ ...base, routes: [...base.routes].reverse() })).toBe(cacheKey(base));
  });

  it('is 32 hex characters', () => {
    expect(cacheKey(base)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('personaHash', () => {
  it('changes when behaviour changes, not when name or tagline change', () => {
    const w = getPersona('wraith');
    expect(personaHash({ ...w, name: 'X', tagline: 'Y', sprite: 'z' })).toBe(personaHash(w));
    expect(personaHash({ ...w, behaviour: w.behaviour + ' More.' })).not.toBe(personaHash(w));
    expect(personaHash({ ...w, allowedSteps: ['goto'] })).not.toBe(personaHash(w));
  });
});
