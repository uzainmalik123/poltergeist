import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Step } from '../../src/compiler/dsl.js';
import { parseConfig, type LoadedConfig } from '../../src/config/load.js';
import { generate } from '../../src/personas/generators/index.js';
import { markBlockedByRule, runActor, startActor, type ActorEnv, type ActorRun } from '../../src/runner/actor.js';
import { BarrierSet } from '../../src/runner/barrier.js';
import { installHolds } from '../../src/runner/holds.js';
import type { ActorName, StepResult } from '../../src/runner/types.js';
import { guardLaunchOptions, newGuardedContext } from '../../src/safety/guard.js';
import { PASSWORD, USER, sessionState, startClaimsFixture, type ClaimsFixture } from './claims-fixture.js';

let browser: Browser;
let fixture: ClaimsFixture;
let loaded: LoadedConfig;
const contexts: BrowserContext[] = [];

beforeAll(async () => {
  fixture = await startClaimsFixture();
  browser = await chromium.launch(guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] }));
  loaded = parseConfig(
    {
      target: fixture.origin,
      routes: [{ path: '/claims', auth: true }],
      accounts: {
        default: { loginRoute: '/login', username: USER, password: 'env:GHOST_PASS' },
        slow: { loginRoute: '/api/hang', username: USER, password: 'slow-pass-1' },
      },
    },
    { configPath: join(tmpdir(), 'poltergeist.config.json'), env: { GHOST_PASS: PASSWORD } },
  );
});
afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => undefined)));
});

async function env(
  opts: { actor?: ActorName; barriers?: BarrierSet; session?: boolean; stepTimeoutMs?: number; seed?: number } = {},
): Promise<ActorEnv & { stepped: { r: StepResult; xy?: { x: number; y: number } }[] }> {
  const context = await newGuardedContext(
    browser,
    { allowedHosts: loaded.allowedHosts },
    opts.session === false ? {} : { storageState: sessionState(fixture.origin) },
  );
  contexts.push(context);
  const stepped: { r: StepResult; xy?: { x: number; y: number } }[] = [];
  return {
    actor: opts.actor ?? 'a',
    page: await context.newPage(),
    context,
    origin: fixture.origin,
    loaded,
    holds: await installHolds(context, fixture.origin),
    barriers: opts.barriers ?? new BarrierSet(['a']),
    seed: opts.seed ?? 7,
    stepTimeoutMs: opts.stepTimeoutMs ?? 5000,
    onStep: (r, xy) => stepped.push({ r, xy }),
    stepped,
  };
}

describe('runActor', () => {
  it('runs goto and click, reporting the cursor position', async () => {
    const e = await env();
    const run = await runActor([{ goto: '/claims' }, { click: { role: 'button', name: 'Claim Candy 2' } }], e);
    expect(run.end).toBe('done');
    expect(run.steps.map((s) => s.outcome)).toEqual(['ok', 'ok']);
    await e.page.getByText('Claimed!').waitFor();
    const click = e.stepped.find((s) => s.r.type === 'click')!;
    expect(click.xy?.x).toBeGreaterThan(0);
    expect(click.r.startedAt).toBeGreaterThan(0);
  });

  it('fills generated values that repeat for the same seed', async () => {
    const steps: Step[] = [{ goto: '/form' }, { fill: { target: { label: 'Note' }, input: { generator: 'naughty' } } }];
    const e1 = await env({ seed: 99 });
    expect((await runActor(steps, e1)).end).toBe('done');
    const v1 = await e1.page.getByLabel('Note').inputValue();
    expect(v1).toBe(generate('naughty', 99, 0));
    const e2 = await env({ seed: 99 });
    await runActor(steps, e2);
    expect(await e2.page.getByLabel('Note').inputValue()).toBe(v1);
    expect(JSON.stringify(e1.stepped)).not.toContain(JSON.stringify(v1).slice(1, -1) || '\u0000');
  });

  it('notes when a target matches several elements', async () => {
    const e = await env();
    const run = await runActor([{ goto: '/form' }, { click: { role: 'button', name: 'Clear' } }], e);
    expect(run.end).toBe('done');
    expect(run.steps[1]?.note).toMatch(/\d+ matches, used the first/);
  });

  it('times out a step on a missing target', async () => {
    const e = await env({ stepTimeoutMs: 400 });
    const t = performance.now();
    const run = await runActor([{ goto: '/claims' }, { click: { role: 'button', name: 'Nope' } }, { goto: '/' }], e);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(run.end).toBe('timeout');
    expect(run.steps.map((s) => s.outcome)).toEqual(['ok', 'timeout']);
  });

  it('is not blocked by a request that never answers', async () => {
    const e = await env();
    const run = await runActor([{ goto: '/hang' }, { click: { role: 'button', name: 'Save' } }, { goto: '/' }], e);
    expect(run.end).toBe('done');
  });

  it('logs in and out', async () => {
    const e = await env({ session: false });
    const run = await runActor([{ login: { account: 'default' } }, { goto: '/claims' }], e);
    expect(run.end).toBe('done');
    expect(run.loggedIn).toBe(true);
    expect(new URL(e.page.url()).pathname).toBe('/claims');
    const out = await runActor([{ logout: true }, { goto: '/claims' }], e);
    expect(out.end).toBe('done');
    expect(new URL(e.page.url()).pathname).toBe('/login');
  });

  it('counts a login that times out as logged in (the password may be typed)', async () => {
    const e = await env({ session: false, stepTimeoutMs: 500 });
    const run = await runActor([{ login: { account: 'slow' } }], e);
    expect(run.end).not.toBe('done');
    expect(run.loggedIn).toBe(true);
  });

  it('fails a login to an unknown account', async () => {
    const e = await env({ session: false });
    const run = await runActor([{ login: { account: 'ghost' } }], e);
    expect(run.end).toBe('failed');
    expect(run.steps[0]?.error).toMatch(/ghost/);
  });

  it('breaks the barrier for the other actor when one fails first', async () => {
    const barriers = new BarrierSet(['a', 'b']);
    const a = await env({ actor: 'a', barriers });
    const b = await env({ actor: 'b', barriers, stepTimeoutMs: 400 });
    const t = performance.now();
    const [ra, rb] = await Promise.all([
      runActor([{ goto: '/claims' }, { barrier: 'fire' }, { click: { role: 'button', name: 'Claim Candy 5' } }], a),
      runActor([{ goto: '/claims' }, { click: { role: 'button', name: 'Nope' } }, { barrier: 'fire' }], b),
    ]);
    expect(rb.end).toBe('timeout');
    expect(ra.end).toBe('broken');
    expect(performance.now() - t).toBeLessThan(3000);
  });

  it('releases held requests when the actor ends', async () => {
    const e = await env();
    const before = fixture.arrivals().length;
    const run = await runActor(
      [{ goto: '/claims' }, { holdRequests: 'POST /api/claims' }, { click: { role: 'button', name: 'Claim Candy 6' } }],
      e,
    );
    expect(run.end).toBe('done');
    await e.page.getByText(/Claimed!|Already claimed/).first().waitFor();
    expect(fixture.arrivals().length).toBe(before + 1);
  });

  it('stops before the next step once the run is aborted', async () => {
    const e = await env();
    const ac = new AbortController();
    const { done } = startActor([{ goto: '/claims' }, { wait: 300 }, { goto: '/form' }], { ...e, signal: ac.signal });
    await new Promise((r) => setTimeout(r, 150));
    ac.abort(new Error('leak'));
    const run = await done;
    expect(run.end).toBe('failed');
    expect(run.error).toMatch(/aborted/);
    expect(run.steps.map((s) => s.type)).toEqual(['goto', 'wait']);
  });

  it('exposes the in-flight step while running', async () => {
    const e = await env();
    const { run, done } = startActor([{ goto: '/claims' }, { wait: 300 }], e);
    await new Promise((r) => setTimeout(r, 150));
    expect(run.steps.length).toBeGreaterThanOrEqual(1);
    await done;
    expect(run.steps.map((s) => s.type)).toEqual(['goto', 'wait']);
  });
});

describe('markBlockedByRule', () => {
  const run = (outcome: StepResult['outcome']): ActorRun => ({
    steps: [
      { actor: 'a', index: 0, type: 'click', outcome, startedAt: 0, durationMs: 5 },
      { actor: 'a', index: 1, type: 'wait', outcome: 'ok', startedAt: 5, durationMs: 0 },
    ],
    end: 'done',
    loggedIn: false,
  });

  it('marks the latest action step that was ok', () => {
    const r = run('ok');
    markBlockedByRule(r);
    expect(r.steps.map((s) => s.outcome)).toEqual(['blocked-by-rule', 'ok']);
  });

  it.each(['failed', 'timeout'] as const)('keeps a %s outcome', (outcome) => {
    const r = run(outcome);
    markBlockedByRule(r);
    expect(r.steps[0]?.outcome).toBe(outcome);
  });
});
