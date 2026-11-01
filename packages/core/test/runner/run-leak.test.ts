import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { RunnerSafetyError } from '../../src/runner/errors.js';
import { runPlans } from '../../src/runner/run.js';
import { guardLaunchOptions } from '../../src/safety/guard.js';
import { startClaimsFixture, type ClaimsFixture } from './claims-fixture.js';
import { loadFor, plan } from './run-helpers.js';

// A real `leak` can't be produced behind the dead proxy, so a `host` block stands in for one here.
vi.mock('../../src/runner/match.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/runner/match.js')>();
  return { ...real, blockAction: (b: { reason: string }) => (b.reason === 'host' ? 'abort-run' : real.blockAction(b as never)) };
});

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

it('aborts the whole run with RunnerSafetyError and flushes events', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'leak-'));
  const p = plan('9.1', 'wraith', { a: [{ goto: '/ext' }, { wait: 500 }] }, [{ noConsoleErrors: true }], [{ path: '/ext', identity: 'anonymous' }]);
  const run = runPlans(browser, loadFor(fixture.origin), [p], { sessions: new Map(), outDir, reps: 3, frameFps: 0 });
  await expect(run).rejects.toBeInstanceOf(RunnerSafetyError);
  const log = await readFile(join(outDir, 'events.ndjson'), 'utf8');
  expect(log).toContain('guard.blocked');
  expect(log).not.toContain('"rep":2');
});
