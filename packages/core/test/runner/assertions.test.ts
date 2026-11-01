import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Assertion } from '../../src/compiler/dsl.js';
import { Redactor } from '../../src/config/redact.js';
import { runAssertions, type AssertEnv, type ConsoleRecord } from '../../src/runner/assertions.js';
import type { AssertionResult } from '../../src/runner/types.js';
import { compileForbidden } from '../../src/safety/forbidden.js';
import { guardLaunchOptions, newGuardedContext } from '../../src/safety/guard.js';
import { sessionState, startClaimsFixture, type ClaimsFixture } from './claims-fixture.js';

const HOSTS = ['localhost', '127.0.0.1', '::1'];
let browser: Browser;
let fixture: ClaimsFixture;
let context: BrowserContext | undefined;

beforeAll(async () => {
  fixture = await startClaimsFixture();
  browser = await chromium.launch(guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] }));
});
afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});
afterEach(async () => {
  await context?.close();
  context = undefined;
});

/** Opens `path` with console, page-error and guard listeners, then evaluates `asserts` there. */
async function check(path: string, asserts: Assertion[], before?: (page: Page) => Promise<void>): Promise<AssertionResult[]> {
  const consoleErrors: ConsoleRecord[] = [];
  const pageErrors: string[] = [];
  const blockedUrls = new Set<string>();
  const forbidden = [{ method: 'DELETE', path: '/api/admin/*' }];
  context = await newGuardedContext(
    browser,
    { allowedHosts: HOSTS, forbidden, onBlocked: (b) => blockedUrls.add(b.url) },
    { storageState: sessionState(fixture.origin) },
  );
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ text: m.text(), url: m.location().url });
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`${fixture.origin}${path}`);
  await before?.(page);
  await page.waitForTimeout(100);
  const env: AssertEnv = {
    page,
    context,
    origin: fixture.origin,
    allowedHosts: HOSTS,
    forbidden: compileForbidden(forbidden),
    redactor: new Redactor(['s3cret']),
    consoleErrors,
    pageErrors,
    blockedUrls,
    pollMs: 1000,
    deadline: Date.now() + 10_000,
  };
  return runAssertions(asserts, env);
}

const oks = (rs: AssertionResult[]) => rs.map((r) => r.ok);

describe('runAssertions', () => {
  it('textVisible and textNotVisible', async () => {
    const rs = await check('/claims', [{ textVisible: 'Claim Candy 3' }, { textVisible: 'Nope' }, { textNotVisible: 'Nope' }, { textNotVisible: 'Claims' }]);
    expect(oks(rs)).toEqual([true, false, true, false]);
    expect(rs[1]).toMatchObject({ index: 1, type: 'textVisible', failure: 'app' });
  });

  it('polls for text that appears late', async () => {
    const rs = await check('/form', [{ textVisible: 'Late text' }]);
    expect(oks(rs)).toEqual([true]);
  });

  it('urlMatches with a glob', async () => {
    expect(oks(await check('/claims', [{ urlMatches: '/claims' }, { urlMatches: '/cl*' }, { urlMatches: '/form' }]))).toEqual([true, true, false]);
  });

  it('elementCount', async () => {
    const rs = await check('/form', [
      { elementCount: { target: { role: 'button', name: 'Clear' }, equals: 2 } },
      { elementCount: { target: { role: 'button', name: 'Clear' }, equals: 1 } },
    ]);
    expect(oks(rs)).toEqual([true, false]);
  });

  it('api with status, jsonPath and equals', async () => {
    const rs = await check('/claims', [
      { api: { method: 'GET', path: '/api/candies/none', status: 200, jsonPath: '$.claims.length', equals: 0 } },
      { api: { method: 'GET', path: '/api/candies/none', jsonPath: '$.claims.length', equals: 1 } },
      { api: { method: 'GET', path: '/api/candies/none', status: 404 } },
      { api: { method: 'GET', path: '/api/candies/none', jsonPath: '$.missing' } },
      { api: { method: 'GET', path: '/', jsonPath: '$.a' } },
    ]);
    expect(oks(rs)).toEqual([true, false, false, false, false]);
    expect(rs.slice(1).map((r) => r.failure)).toEqual(['app', 'app', 'app', 'app']);
  });

  it('api with an unsupported jsonPath is the plan’s fault', async () => {
    const [r] = await check('/claims', [{ api: { method: 'GET', path: '/api/candies/x', jsonPath: 'claims' } }]);
    expect(r).toMatchObject({ ok: false, failure: 'plan' });
  });

  it('never sends an api request to a forbidden path', async () => {
    const [r] = await check('/claims', [{ api: { method: 'DELETE', path: '/api/admin/all' } }]);
    expect(r).toMatchObject({ ok: false, failure: 'blocked' });
    expect(fixture.seen()).not.toContain('DELETE /api/admin/all');
  });

  it('noConsoleErrors ignores errors from guard-blocked loads', async () => {
    expect(oks(await check('/ext', [{ noConsoleErrors: true }]))).toEqual([true]);
  });

  it('noConsoleErrors fails on a real console error', async () => {
    const [r] = await check('/console', [{ noConsoleErrors: true }]);
    expect(r?.ok).toBe(false);
    expect(r?.detail).toContain('boom');
  });

  it('noUncaughtExceptions', async () => {
    expect(oks(await check('/throws', [{ noUncaughtExceptions: true }]))).toEqual([false]);
    expect(oks(await check('/claims', [{ noUncaughtExceptions: true }]))).toEqual([true]);
  });

  it('noConsoleErrors still fails on an app error when something else was blocked', async () => {
    const [r] = await check('/mixed', [{ noConsoleErrors: true }]);
    expect(r?.ok).toBe(false);
    expect(r?.detail).toMatch(/500/);
  });

  it('never follows an api redirect onto a forbidden path', async () => {
    const [r] = await check('/claims', [{ api: { method: 'DELETE', path: '/api/redir', status: 307 } }]);
    expect(r?.ok).toBe(true);
    expect(fixture.seen()).not.toContain('DELETE /api/admin/all');
  });

  it('matches text case-sensitively on whole words', async () => {
    const rs = await check('/form', [
      { textNotVisible: 'Error' },
      { textVisible: '1 claimed' },
      { textVisible: 'errors here' },
      { textVisible: '11 claimed' },
      { textVisible: 'Notes' },
    ]);
    expect(oks(rs)).toEqual([true, false, true, true, true]);
  });

  it('redacts details', async () => {
    const [r] = await check('/claims', [{ textVisible: 's3cret' }]);
    expect(r?.detail).not.toContain('s3cret');
  });
});
