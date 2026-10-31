import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config/load.js';
import type { BlockedRequest } from '../../src/safety/guard.js';
import { guardLaunchOptions, newGuardedContext } from '../../src/safety/guard.js';
import { scout } from '../../src/scout/scout.js';
import type { RouteScout, ScoutResult } from '../../src/scout/types.js';
import { PASSWORD, SESSION, USER, startCandyFixture, type CandyFixture } from './candy-fixture.js';

const ROUTE_MS = 3000;
let browser: Browser;
let fixture: CandyFixture;
let outDir: string;
let result: ScoutResult;
const visits: { path: string; identity: string; at: number }[] = [];
const forwarded: BlockedRequest[] = [];

const ROUTES = [
  { path: '/', auth: false },
  { path: '/old', auth: false },
  { path: '/missing', auth: false },
  { path: '/slow', auth: false },
  { path: '/busy', auth: false },
  { path: '/ext', auth: false },
  { path: '/huge', auth: false },
  { path: '/market', auth: true },
  { path: '/trade/new', auth: true },
  { path: '/vault', auth: true },
  { path: '/inventory', auth: 'bad' },
];

const load = (origin: string, routes: unknown[] = ROUTES) =>
  parseConfig(
    {
      target: origin,
      routes,
      accounts: {
        default: { loginRoute: '/login', username: USER, password: 'env:GHOST_PASS' },
        bad: { loginRoute: '/login', username: USER, password: 'wrong-pass-13' },
      },
    },
    { configPath: join(tmpdir(), 'poltergeist.config.json'), env: { GHOST_PASS: PASSWORD } },
  );

const route = (path: string): RouteScout => {
  const r = result.routes.find((x) => x.path === path);
  if (!r) throw new Error(`no route ${path}`);
  return r;
};

beforeAll(async () => {
  fixture = await startCandyFixture();
  browser = await chromium.launch(guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] }));
  outDir = await mkdtemp(join(tmpdir(), 'scout-'));
  result = await scout(browser, load(fixture.origin), {
    outDir,
    routeTimeoutMs: ROUTE_MS,
    onRoute: (r) => visits.push({ path: r.path, identity: r.identity, at: Date.now() }),
    onBlocked: (b) => forwarded.push(b),
  });
}, 60000);

afterAll(async () => {
  await browser?.close();
  await fixture?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

describe('scout (Done when, on the Candy fixture, D-30)', () => {
  it('lists the Claim buttons and the trade form by role and name', () => {
    expect(route('/market').interactive).toContainEqual({ role: 'button', name: 'Claim Sour Skulls', count: 1, testId: 'claim-sour-skulls' });
    expect(route('/market').interactive).toContainEqual({ role: 'button', name: 'Claim Candy Corn', count: 2 });
    const trade = route('/trade/new').interactive;
    expect(trade).toContainEqual({ role: 'textbox', name: 'Offer', count: 1, label: 'Offer' });
    expect(trade).toContainEqual({ role: 'combobox', name: 'Want', count: 1, label: 'Want' });
    expect(trade).toContainEqual({ role: 'textbox', name: 'Note', count: 1, label: 'Note' });
    expect(trade).toContainEqual({ role: 'button', name: 'Propose trade', count: 1 });
  });

  it('emits only labels and testIds that resolve, using the in-memory session', async () => {
    const loaded = load(fixture.origin);
    const context = await newGuardedContext(browser, { allowedHosts: loaded.allowedHosts }, { storageState: result.sessions.get('default') });
    try {
      const page = await context.newPage();
      for (const path of ['/market', '/trade/new']) {
        await page.goto(`${fixture.origin}${path}`);
        const r = route(path);
        expect(r.status).toBe('ok');
        for (const e of r.interactive) {
          if (e.label) expect(await page.getByLabel(e.label, { exact: true }).count()).toBe(1);
          if (e.testId) expect(await page.getByTestId(e.testId).count()).toBe(1);
        }
        for (const t of r.testIds) expect(await page.getByTestId(t.testId).count()).toBe(1);
      }
    } finally {
      await context.close();
    }
  });
});

describe('scout statuses', () => {
  it('records ok, redirected and unreachable', () => {
    expect(route('/')).toMatchObject({ status: 'ok', identity: 'anonymous', settled: true });
    expect(route('/old')).toMatchObject({ status: 'redirected', finalPath: '/', reason: 'redirected to /' });
    expect(route('/missing')).toMatchObject({ status: 'unreachable', reason: 'HTTP 404', snapshot: '', interactive: [] });
  });

  it('gives up on a route that never answers within its budget and carries on', () => {
    expect(route('/slow').status).toBe('unreachable');
    expect(route('/slow').reason).toMatch(/^load timed out after \d+ ms$/);
    const i = visits.findIndex((v) => v.path === '/slow');
    expect((visits[i]?.at ?? 0) - (visits[i - 1]?.at ?? 0)).toBeLessThan(ROUTE_MS + 1500);
    expect(route('/busy')).toMatchObject({ status: 'ok', settled: false });
  });

  it('marks a lost session and a failed login as authFailed', () => {
    expect(route('/vault')).toMatchObject({ status: 'authFailed', reason: 'session lost: redirected to /login' });
    const inv = route('/inventory');
    expect(inv.status).toBe('authFailed');
    expect(inv.reason).toContain('/login/failed');
    expect(inv.title).toBeUndefined();
    expect(result.sessions.has('bad')).toBe(false);
    expect(result.sessions.has('default')).toBe(true);
  });

  it('records blocked requests per route', () => {
    expect(route('/ext').blocked).toEqual([expect.objectContaining({ host: 'evil.test', reason: 'host' })]);
    expect(forwarded.some((b) => b.host === 'evil.test')).toBe(true);
  });

  it('fits a huge page to the budget and keeps the full snapshot', () => {
    const huge = route('/huge');
    expect(JSON.stringify({ interactive: huge.interactive, testIds: huge.testIds, snapshot: huge.snapshot }).length).toBeLessThanOrEqual(16000);
    expect(huge.trimmed).toBe(true);
    expect(huge.snapshotFull).toContain('Item 1999');
  });
});

describe('scout output', () => {
  it('writes one file per route and nothing else', async () => {
    const files = (await readdir(join(outDir, 'scout'))).sort();
    expect(files).toEqual(
      ['index', 'old', 'missing', 'slow', 'busy', 'ext', 'huge', 'market', 'trade__new', 'vault', 'inventory'].map((s) => `${s}.json`).sort(),
    );
    const market = JSON.parse(await readFile(join(outDir, 'scout', 'market.json'), 'utf8')) as RouteScout;
    expect(market).toEqual(route('/market'));
  });

  it('never writes a password or a session cookie', async () => {
    for (const f of await readdir(join(outDir, 'scout'))) {
      const text = await readFile(join(outDir, 'scout', f), 'utf8');
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain('wrong-pass-13');
      expect(text).not.toContain(SESSION);
    }
  });

  it('calls onRoute in visit order and returns routes in config order', () => {
    expect(result.routes.map((r) => r.path)).toEqual(ROUTES.map((r) => r.path));
    expect(visits.map((v) => v.identity)).toEqual([...Array(7).fill('anonymous'), 'default', 'default', 'default', 'bad']);
  });

  it('writes one file per identity when a path is scouted twice', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scout-'));
    try {
      const twice = [{ path: '/market', auth: false }, { path: '/market', auth: true }];
      const r = await scout(browser, load(fixture.origin, twice), { outDir: dir });
      expect(r.routes.map((x) => x.slug)).toEqual(['market_anonymous', 'market_default']);
      expect((await readdir(join(dir, 'scout'))).sort()).toEqual(['market_anonymous.json', 'market_default.json']);
      expect(r.routes.map((x) => x.status)).toEqual(['redirected', 'ok']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('hashes stably across runs', async () => {
    const small = ROUTES.filter((r) => ['/', '/market', '/trade/new'].includes(r.path));
    const dir = await mkdtemp(join(tmpdir(), 'scout-'));
    try {
      const a = await scout(browser, load(fixture.origin, small), { outDir: dir });
      const b = await scout(browser, load(fixture.origin, small), { outDir: dir });
      expect(a.scoutHash).toMatch(/^[0-9a-f]{16}$/);
      expect(a.scoutHash).toBe(b.scoutHash);
      expect(a.routes[1]?.routeHash).toBe(route('/market').routeHash);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
