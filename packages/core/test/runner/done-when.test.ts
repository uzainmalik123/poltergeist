import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPlans } from '../../src/runner/run.js';
import type { PairRepResult } from '../../src/runner/types.js';
import { guardLaunchOptions } from '../../src/safety/guard.js';
import { sessionState, startClaimsFixture, type ClaimsFixture } from './claims-fixture.js';
import { loadFor, plan } from './run-helpers.js';

// PRD F06 Done-when on the fixture (D-33). The real Candy Swap check is KI-36.
let browser: Browser;
let fixture: ClaimsFixture;

beforeAll(async () => {
  fixture = await startClaimsFixture();
  browser = await chromium.launch(guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] }));
});
afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});

const maxOverlap = (rs: PairRepResult[]) =>
  Math.max(...rs.map((r) => rs.filter((o) => o.startedAt <= r.startedAt && r.startedAt < o.endedAt).length));

describe('F06 Done-when (fixture)', () => {
  it('releases a Doppelgänger plan’s actors at the barrier < 50 ms apart, and finds the race (KI-07)', async () => {
    const steps = [{ goto: '/claims' }, { barrier: 'fire' }, { click: { role: 'button' as const, name: 'Claim Sour Skulls' } }, { wait: 500 }];
    const p = plan('3.2', 'doppelganger', { a: steps, b: steps }, [
      { api: { method: 'GET', path: '/api/candies/sour-skulls', jsonPath: '$.claims.length', equals: 1 } },
    ]);
    const gaps: number[] = [];
    const r = await runPlans(browser, loadFor(fixture.origin), [p], {
      sessions: new Map([['default', sessionState(fixture.origin)]]),
      reps: 3,
      frameFps: 0,
      onEvent: (e) => {
        if (e.type !== 'rep.finished') return;
        const [x, y] = fixture.arrivals();
        gaps.push(x !== undefined && y !== undefined ? Math.abs(x - y) : Infinity);
      },
    });
    expect(r.results.map((x) => x.outcome)).toEqual(['completed', 'completed', 'completed']);
    expect(gaps).toHaveLength(3);
    for (const g of gaps) expect(g).toBeLessThan(50);
    const haunted = r.results.filter((x) => x.assertions[0]?.ok === false).length;
    expect(haunted).toBeGreaterThanOrEqual(2);
  });

  it('runs 12 ghosts at once and finishes quickly', async () => {
    const plans = Array.from({ length: 12 }, (_, i) =>
      plan(`1.${i + 1}`, 'wraith', { a: [{ goto: '/claims' }, { dblclick: { role: 'button', name: `Claim Candy ${i + 1}` } }, { wait: 500 }] }, [
        { noUncaughtExceptions: true },
      ]),
    );
    const t = performance.now();
    const r = await runPlans(browser, loadFor(fixture.origin), plans, {
      sessions: new Map([['default', sessionState(fixture.origin)]]),
      reps: 1,
      concurrency: 12,
    });
    expect(performance.now() - t).toBeLessThan(60_000);
    expect(r.results.every((x) => x.outcome === 'completed')).toBe(true);
    expect(maxOverlap(r.results)).toBe(12);
  });
});
