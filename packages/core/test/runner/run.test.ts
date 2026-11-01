import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../../src/personas/generators/index.js';
import { runPlans } from '../../src/runner/run.js';
import { DEFAULT_SEED, pairSeed } from '../../src/runner/seed.js';
import type { RunEvent } from '../../src/runner/types.js';
import { guardLaunchOptions } from '../../src/safety/guard.js';
import { sessionState, startClaimsFixture, type ClaimsFixture } from './claims-fixture.js';
import { loadFor, plan } from './run-helpers.js';

let browser: Browser;
let fixture: ClaimsFixture;
let sessions: Map<string, ReturnType<typeof sessionState>>;

beforeAll(async () => {
  fixture = await startClaimsFixture();
  browser = await chromium.launch(guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] }));
  sessions = new Map([['default', sessionState(fixture.origin)]]);
});
afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});

const exists = (p: string) => stat(p).then(() => true, () => false);
const events = async (dir: string) =>
  (await readFile(join(dir, 'events.ndjson'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as RunEvent);

describe('runPlans', () => {
  it('runs every rep after a reset and records events in order', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'run-'));
    const resetsBefore = fixture.resets();
    const p = plan(
      '1.1',
      'wraith',
      { a: [{ goto: '/claims' }, { dblclick: { role: 'button', name: 'Claim Candy 3' } }, { wait: 300 }] },
      [{ api: { method: 'GET', path: '/api/candies/candy-3', jsonPath: '$.claims.length', equals: 1 } }],
    );
    const r = await runPlans(browser, loadFor(fixture.origin), [p], { sessions, outDir, reps: 2, frameFps: 4 });
    expect(r.reps).toBe(2);
    expect(r.seed).toBe(DEFAULT_SEED);
    expect(r.results.map((x) => [x.rep, x.outcome])).toEqual([[1, 'completed'], [2, 'completed']]);
    expect(r.results[0]!.assertions[0]!.ok).toBe(r.results[1]!.assertions[0]!.ok);
    expect(fixture.resets() - resetsBefore).toBe(2);
    expect(r.resets).toHaveLength(2);
    const types = (await events(outDir)).map((e) => e.type);
    const rep1 = types.slice(0, types.indexOf('rep.finished') + 1);
    expect(rep1[0]).toBe('rep.started');
    expect(rep1[1]).toBe('reset.finished');
    expect(rep1).toContain('ghost.spawned');
    expect(rep1.filter((t) => t === 'ghost.step')).toHaveLength(3);
    expect(rep1).toContain('assert.result');
    expect(types).not.toContain('ghost.frame');
    expect(await exists(join(outDir, 'frames', '1.1__wraith__r1__a'))).toBe(true);
  });

  it('gives every rep the same generated inputs', async () => {
    const value = generate('plain', pairSeed(DEFAULT_SEED, '2.1', 'banshee'), 0);
    const p = plan(
      '2.1',
      'banshee',
      { a: [{ goto: '/form' }, { fill: { target: { label: 'Note' }, input: { generator: 'plain' } } }, { click: { role: 'button', name: 'Save' } }] },
      [{ textVisible: value }],
      [{ path: '/form', identity: 'anonymous' }],
    );
    const r = await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 3, frameFps: 0 });
    expect(r.results.map((x) => x.assertions[0]?.ok)).toEqual([true, true, true]);
  });

  it('makes a failed reset a systemError and spawns no ghosts', async () => {
    const seen: RunEvent[] = [];
    const p = plan('3.1', 'wraith', { a: [{ goto: '/claims' }] }, [{ noConsoleErrors: true }]);
    const r = await runPlans(browser, loadFor(fixture.origin, { resetCommand: 'exit 3' }), [p], {
      sessions,
      reps: 1,
      frameFps: 0,
      onEvent: (e) => seen.push(e),
    });
    expect(r.results.map((x) => x.outcome)).toEqual(['systemError']);
    expect(seen.map((e) => e.type)).not.toContain('ghost.spawned');
    expect(seen.find((e) => e.type === 'reset.finished')).toMatchObject({ ok: false });
  });

  it('reports a missing session as a systemError', async () => {
    const p = plan('4.1', 'wraith', { a: [{ goto: '/claims' }] }, [{ noConsoleErrors: true }], [{ path: '/claims', identity: 'ghost' }]);
    const [res] = (await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 1, frameFps: 0 })).results;
    expect(res).toMatchObject({ outcome: 'systemError' });
    expect(res?.error).toMatch(/no session/);
  });

  it('refuses a plan with two accounts as a planError', async () => {
    const routes = [{ path: '/claims', identity: 'default' }, { path: '/form', identity: 'other' }];
    const p = plan('4.2', 'wraith', { a: [{ goto: '/claims' }] }, [{ noConsoleErrors: true }], routes);
    const [res] = (await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 1, frameFps: 0 })).results;
    expect(res?.outcome).toBe('planError');
  });

  it('marks the action that hit a forbidden rule as blocked-by-rule', async () => {
    const p = plan(
      '5.1',
      'wraith',
      { a: [{ goto: '/admin' }, { click: { role: 'button', name: 'Delete all' } }, { wait: 300 }] },
      [{ noUncaughtExceptions: true }],
      [{ path: '/admin', identity: 'default' }],
    );
    const [res] = (await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 1, frameFps: 0 })).results;
    expect(res?.outcome).toBe('completed');
    expect(res?.steps.map((s) => s.outcome)).toEqual(['ok', 'blocked-by-rule', 'ok']);
    expect(res?.blocked.map((b) => b.reason)).toEqual(['forbidden']);
    expect(fixture.seen()).not.toContain('DELETE /api/admin/all');
  });

  it('times out a rep at the plan budget, even while an actor waits at a barrier', async () => {
    const p = plan(
      '6.1',
      'doppelganger',
      { a: [{ goto: '/claims' }, { barrier: 'x' }], b: [{ goto: '/claims' }, { wait: 2000 }, { wait: 2000 }, { barrier: 'x' }] },
      [{ noConsoleErrors: true }],
    );
    const t = performance.now();
    const [res] = (await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 1, frameFps: 0, planTimeoutMs: 1500 })).results;
    expect(res?.outcome).toBe('timeout');
    expect(performance.now() - t).toBeLessThan(4000);
  });

  it('records the steps in flight at a plan timeout as timeouts and emits nothing for them', async () => {
    const p = plan(
      '6.2',
      'doppelganger',
      { a: [{ goto: '/claims' }, { barrier: 'x' }], b: [{ goto: '/claims' }, { wait: 4000 }, { barrier: 'x' }] },
      [{ noConsoleErrors: true }],
    );
    const seen: RunEvent[] = [];
    const r = await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 1, frameFps: 0, planTimeoutMs: 1000, onEvent: (e) => seen.push(e) });
    const res = r.results[0]!;
    expect(res.outcome).toBe('timeout');
    const inFlight = res.steps.filter((st) => st.index === 1);
    expect(inFlight.map((st) => [st.actor, st.type, st.outcome, st.error])).toEqual([
      ['a', 'barrier', 'timeout', 'plan exceeded 1000 ms'],
      ['b', 'wait', 'timeout', 'plan exceeded 1000 ms'],
    ]);
    expect(seen.filter((e) => e.type === 'ghost.step' && e.index === 1)).toEqual([]);
    const before = JSON.stringify(res.steps);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(JSON.stringify(res.steps)).toBe(before);
  }, 15_000);

  it('names the root cause, not the broken barrier, in the rep error', async () => {
    const p = plan(
      '6.3',
      'doppelganger',
      { a: [{ goto: '/claims' }, { barrier: 'x' }], b: [{ goto: '/claims' }, { login: { account: 'nobody' } }, { barrier: 'x' }] },
      [{ noConsoleErrors: true }],
    );
    const [res] = (await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 1, frameFps: 0 })).results;
    expect(res?.outcome).toBe('planError');
    expect(res?.error).toContain('unknown account');
    expect(res?.error).not.toContain('barrier');
  });

  it('keeps a screenshot and trace for a failed rep only', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'run-'));
    const failing = plan('7.1', 'wraith', { a: [{ goto: '/form' }] }, [{ textVisible: 'Nope' }], [{ path: '/form', identity: 'anonymous' }]);
    const passing = plan('7.2', 'wraith', { a: [{ goto: '/form' }] }, [{ textVisible: 'Notes' }], [{ path: '/form', identity: 'anonymous' }]);
    const r = await runPlans(browser, loadFor(fixture.origin), [failing, passing], { sessions, outDir, reps: 1, frameFps: 0 });
    const f = r.results.find((x) => x.criterion === '7.1')!;
    expect(f.artifacts.sort()).toEqual(['artifacts/7.1__wraith__rep1/screenshot-a.png', 'artifacts/7.1__wraith__rep1/trace-a.zip']);
    for (const a of f.artifacts) expect(await exists(join(outDir, a))).toBe(true);
    const ok = r.results.find((x) => x.criterion === '7.2')!;
    expect(ok.artifacts).toEqual([]);
    expect(await exists(join(outDir, 'artifacts', '7.2__wraith__rep1'))).toBe(false);
  });

  it('never keeps a trace of an actor that started from a session (cookies are secrets)', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'run-'));
    const p = plan('7.4', 'wraith', { a: [{ goto: '/claims' }] }, [{ textVisible: 'Nope' }]);
    const [res] = (await runPlans(browser, loadFor(fixture.origin), [p], { sessions, outDir, reps: 1, frameFps: 0 })).results;
    expect(res?.artifacts).toEqual(['artifacts/7.4__wraith__rep1/screenshot-a.png']);
    expect(res?.notes.join(' ')).toMatch(/trace dropped.*session/);
  });

  it('leaves no timers behind once it returns', async () => {
    const timers = () => process.getActiveResourcesInfo().filter((t) => t === 'Timeout').length;
    const before = timers();
    const p = plan('7.5', 'wraith', { a: [{ goto: '/form' }] }, [{ textVisible: 'Notes' }], [{ path: '/form', identity: 'anonymous' }]);
    await runPlans(browser, loadFor(fixture.origin), [p], { sessions, reps: 1, frameFps: 0 });
    expect(timers()).toBeLessThanOrEqual(before);
  });

  it('drops the trace of an actor that logged in', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'run-'));
    const p = plan(
      '7.3',
      'wraith',
      { a: [{ login: { account: 'default' } }, { goto: '/claims' }] },
      [{ textVisible: 'Nope' }],
      [{ path: '/form', identity: 'anonymous' }],
    );
    const [res] = (await runPlans(browser, loadFor(fixture.origin), [p], { sessions, outDir, reps: 1, frameFps: 0 })).results;
    expect(res?.outcome).toBe('completed');
    expect(res?.artifacts).toEqual(['artifacts/7.3__wraith__rep1/screenshot-a.png']);
    expect(res?.notes.join(' ')).toMatch(/trace dropped/);
    expect(await readdir(join(outDir, 'artifacts', '7.3__wraith__rep1'))).toEqual(['screenshot-a.png']);
  });

  it('stops at an external abort', async () => {
    const ac = new AbortController();
    const reps: number[] = [];
    const p = plan('8.1', 'wraith', { a: [{ goto: '/form' }] }, [{ noConsoleErrors: true }], [{ path: '/form', identity: 'anonymous' }]);
    const run = runPlans(browser, loadFor(fixture.origin), [p], {
      sessions,
      reps: 3,
      frameFps: 0,
      signal: ac.signal,
      onEvent: (e) => {
        if (e.type === 'rep.started') reps.push(e.rep);
        if (e.type === 'rep.finished' && e.rep === 1) ac.abort(new Error('user stop'));
      },
    });
    await expect(run).rejects.toThrow('user stop');
    expect(reps).toEqual([1]);
  });

  it('rejects options out of range', async () => {
    const load = loadFor(fixture.origin);
    await expect(runPlans(browser, load, [], { sessions, reps: 0 })).rejects.toThrow(RangeError);
    await expect(runPlans(browser, load, [], { sessions, frameFps: 5 })).rejects.toThrow(RangeError);
    await expect(runPlans(browser, load, [], { sessions, concurrency: 21 })).rejects.toThrow(RangeError);
  });
});
