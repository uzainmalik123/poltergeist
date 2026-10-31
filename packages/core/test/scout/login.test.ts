import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AccountConfig } from '../../src/config/schema.js';
import { Redactor } from '../../src/config/redact.js';
import { effectiveHosts } from '../../src/safety/allowlist.js';
import { guardLaunchOptions, newGuardedContext } from '../../src/safety/guard.js';
import { isUnderLoginRoute, login } from '../../src/scout/login.js';
import { PASSWORD, SESSION, USER, startCandyFixture, type CandyFixture } from './candy-fixture.js';

let browser: Browser;
let fixture: CandyFixture;
let context: BrowserContext | undefined;
const redactor = new Redactor([PASSWORD, 'wrong-pass-13']);

beforeAll(async () => {
  fixture = await startCandyFixture();
  browser = await chromium.launch(guardLaunchOptions());
});

afterEach(async () => {
  await context?.close();
  context = undefined;
});

afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});

async function newPage(): Promise<Page> {
  context = await newGuardedContext(browser, { allowedHosts: effectiveHosts([]) });
  return context.newPage();
}

const account = (over: Partial<AccountConfig> = {}): AccountConfig => ({
  loginRoute: '/login',
  username: USER,
  password: PASSWORD,
  ...over,
});

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

const run = (a: AccountConfig, budget = 10000) =>
  newPage().then((page) => login(page, a, { origin: fixture.origin, deadline: Date.now() + budget, redactor }));

describe('isUnderLoginRoute', () => {
  it('matches the login route and its sub-paths only', () => {
    expect(isUnderLoginRoute('/login', '/login')).toBe(true);
    expect(isUnderLoginRoute('/login/failed', '/login')).toBe(true);
    expect(isUnderLoginRoute('/login/failed', '/login/')).toBe(true);
    expect(isUnderLoginRoute('/login-help', '/login')).toBe(false);
    expect(isUnderLoginRoute('/market', '/login')).toBe(false);
    expect(isUnderLoginRoute('/x', '/')).toBe(false);
    expect(isUnderLoginRoute('/', '/')).toBe(true);
  });
});

describe('login', () => {
  it('logs in with the heuristic and keeps the session cookie', async () => {
    expect(await run(account())).toEqual({ ok: true });
    const cookies = await context!.cookies();
    expect(cookies.find((c) => c.name === 'sid')?.value).toBe(SESSION);
  });

  it('fails fast onto /login/failed and never echoes the password', async () => {
    const { result, ms } = await timed(() => run(account({ password: 'wrong-pass-13' })));
    expect(result.ok).toBe(false);
    expect(ms).toBeLessThan(3000);
    const reason = result.ok ? '' : result.reason;
    expect(reason).toContain('/login/failed');
    expect(reason).not.toContain('wrong-pass-13');
  });

  it('accepts an in-place SPA login', async () => {
    expect(await run(account({ loginRoute: '/spa-login' }))).toEqual({ ok: true });
  });

  it('fails fast on an SPA error alert', async () => {
    const { result, ms } = await timed(() => run(account({ loginRoute: '/spa-login', password: 'wrong-pass-13' })));
    expect(result.ok).toBe(false);
    expect(ms).toBeLessThan(3000);
    expect(result.ok ? '' : result.reason).toContain('Wrong password');
  });

  it('reports a fields override that matches nothing at once', async () => {
    const { result, ms } = await timed(() => run(account({ fields: { submit: { role: 'button', name: 'Nope' } } })));
    expect(result).toEqual({ ok: false, reason: 'fields.submit override matched 0 elements' });
    expect(ms).toBeLessThan(2000);
  });

  it('logs in with fields overrides', async () => {
    const fields = { username: { label: 'Username' }, password: { label: 'Password' }, submit: { role: 'button', name: 'Log in' } };
    expect(await run(account({ fields }))).toEqual({ ok: true });
  });

  it('reports a login page without a form', async () => {
    const result = await run(account({ loginRoute: '/missing' }));
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toMatch(/^no username field found/);
  });

  it('times out within the budget', async () => {
    const { result, ms } = await timed(() => run(account({ loginRoute: '/slow' }), 300));
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toMatch(/timed out/);
    expect(ms).toBeLessThan(1500);
  });
});
