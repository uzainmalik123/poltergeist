import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { effectiveHosts } from '../../src/safety/allowlist.js';
import { guardLaunchOptions, newGuardedContext, type BlockedRequest, type GuardOptions } from '../../src/safety/guard.js';
import { startFixture, type Fixture } from './fixture-server.js';

let browser: Browser;
let fixture: Fixture;
let context: BrowserContext | undefined;

beforeAll(async () => {
  fixture = await startFixture();
  // Every *.test name resolves to the fixture, so allowlisted and refused third parties stay offline.
  browser = await chromium.launch(guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] }));
});

afterEach(async () => {
  await context?.close();
  context = undefined;
});

afterAll(async () => {
  await browser?.close();
  await fixture?.close();
});

async function open(opts: Partial<GuardOptions> = {}): Promise<{ page: Page; blocked: BlockedRequest[] }> {
  const blocked: BlockedRequest[] = [];
  context = await newGuardedContext(browser, {
    allowedHosts: effectiveHosts([]),
    onBlocked: (b) => blocked.push(b),
    ...opts,
  });
  const page = await context.newPage();
  await page.goto(`${fixture.origin}/`);
  return { page, blocked };
}

const tryFetch = (page: Page, url: string, method = 'GET') =>
  page.evaluate(
    ([u, m]) =>
      fetch(u as string, { method: m as string }).then(
        (r) => r.text(),
        () => 'err',
      ),
    [url, method],
  );

/** A stopped redirect is exactly one report: the hop (`host`) or the original request (`redirect`, D-22). */
async function expectOneRedirectReport(blocked: BlockedRequest[], hopHost: string) {
  await expect.poll(() => blocked.length).toBe(1);
  await new Promise((r) => setTimeout(r, 200));
  expect(blocked).toHaveLength(1);
  const [b] = blocked;
  if (b?.reason === 'host') expect(b.host).toBe(hopHost);
  else expect(b).toMatchObject({ reason: 'redirect', host: '127.0.0.1' });
}

const redirect = (to: string) => `${fixture.origin}/redirect?to=${encodeURIComponent(to)}`;

describe('network guard (real Chromium)', { timeout: 15_000 }, () => {
  it('blocks and reports a third-party fetch (Done-when)', async () => {
    const { page, blocked } = await open();
    expect(await tryFetch(page, 'http://evil.test/x')).toBe('err');
    await expect.poll(() => blocked).toEqual([
      expect.objectContaining({ host: 'evil.test', reason: 'host', method: 'GET', url: 'http://evil.test/x' }),
    ]);
  });

  it.each([
    ['evil.test', 'http://evil.test/'],
    ['169.254.169.254', 'http://169.254.169.254/latest/meta-data/'],
    ['127.0.0.2', 'http://127.0.0.2/'],
  ])('stops and reports a redirect hop to %s (Done-when)', async (host, to) => {
    const { page, blocked } = await open();
    expect(await tryFetch(page, redirect(to))).toBe('err');
    await expectOneRedirectReport(blocked, host);
  });

  it('stops a two-hop redirect chain', async () => {
    const { page, blocked } = await open();
    expect(await tryFetch(page, redirect(redirect('http://evil.test/')))).toBe('err');
    await expectOneRedirectReport(blocked, 'evil.test');
  });

  it('stops an EventSource redirect', async () => {
    const { page, blocked } = await open();
    const outcome = await page.evaluate(
      (u) =>
        new Promise<string>((resolve) => {
          const es = new EventSource(u);
          es.onerror = () => {
            es.close();
            resolve('error');
          };
          es.onopen = () => resolve('open');
        }),
      redirect('http://evil.test/'),
    );
    expect(outcome).toBe('error');
    await expectOneRedirectReport(blocked, 'evil.test');
  });

  it('blocks and reports a WebSocket to a third party (Done-when)', async () => {
    const { page, blocked } = await open();
    const outcome = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket('ws://evil.test/ws');
          ws.onopen = () => resolve('open');
          ws.onclose = () => resolve('closed');
        }),
    );
    expect(outcome).toBe('closed');
    await expect.poll(() => blocked).toEqual([
      expect.objectContaining({ host: 'evil.test', reason: 'host', resourceType: 'websocket' }),
    ]);
  });

  it('lets an allowlisted WebSocket through', async () => {
    const { page, blocked } = await open();
    const echo = await page.evaluate(
      (u) =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket(u);
          ws.onopen = () => ws.send('hi');
          ws.onmessage = (e) => resolve(String(e.data));
          ws.onclose = () => resolve('closed');
        }),
      `ws://127.0.0.1:${fixture.port}/ws`,
    );
    expect(echo).toBe('hi');
    expect(blocked).toEqual([]);
  });

  it.each(['localhost', '[::1]'])('follows a redirect within loopback (%s)', async (host) => {
    const { page, blocked } = await open();
    expect(await tryFetch(page, redirect(`http://${host}:${fixture.port}/ok`))).toBe('ok');
    await new Promise((r) => setTimeout(r, 200));
    expect(blocked).toEqual([]);
  });

  it('allows hosts listed in allowedHosts and still blocks the rest', async () => {
    const { page, blocked } = await open({ allowedHosts: effectiveHosts(['ghost.test']) });
    expect(await tryFetch(page, `http://ghost.test:${fixture.port}/ok`)).toBe('ok');
    expect(await tryFetch(page, `http://evil.test:${fixture.port}/ok`)).toBe('err');
    await expect.poll(() => blocked).toEqual([expect.objectContaining({ host: 'evil.test', reason: 'host' })]);
  });

  it('aborts forbidden requests and reports the rule', async () => {
    const rule = { method: 'POST', path: '/api/*' };
    const { page, blocked } = await open({ forbidden: [rule] });
    expect(await tryFetch(page, `${fixture.origin}/api/x`, 'POST')).toBe('err');
    expect(await tryFetch(page, `${fixture.origin}/api/x`)).toBe('ok');
    await expect.poll(() => blocked).toEqual([expect.objectContaining({ reason: 'forbidden', rule, method: 'POST' })]);
  });

  it('blocks and reports other schemes', async () => {
    const { page, blocked } = await open();
    await expect(page.goto('file:///etc/hostname')).rejects.toThrow('ERR_BLOCKED_BY_CLIENT');
    await expect.poll(() => blocked).toEqual([
      expect.objectContaining({ url: 'file:///etc/hostname', reason: 'scheme', resourceType: 'document' }),
    ]);
  });

  it('disables RTCPeerConnection', async () => {
    const { page } = await open();
    const outcome = await page.evaluate(() => {
      // core has no DOM lib; this runs in the page.
      const Rtc = (globalThis as unknown as { RTCPeerConnection: new () => unknown }).RTCPeerConnection;
      try {
        new Rtc();
        return 'made';
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(outcome).toBe('NotAllowedError');
  });

  it('blocks service workers', async () => {
    const { page } = await open();
    // A real, registrable worker: only the guard's block keeps it from installing.
    const registrations = await page.evaluate(async () => {
      type Sw = { register(url: string): Promise<unknown>; getRegistrations(): Promise<unknown[]> };
      const sw = (globalThis as unknown as { navigator: { serviceWorker?: Sw } }).navigator.serviceWorker;
      if (!sw) return 0;
      await sw.register('/sw.js').catch(() => undefined);
      return (await sw.getRegistrations()).length;
    });
    expect(registrations).toBe(0);
  });

  it('survives a throwing onBlocked', async () => {
    const { page } = await open({
      onBlocked: () => {
        throw new Error('listener bug');
      },
    });
    expect(await tryFetch(page, 'http://evil.test/x')).toBe('err');
    expect(await tryFetch(page, `${fixture.origin}/ok`)).toBe('ok');
  });

  it.each<[string, Parameters<typeof newGuardedContext>[2]]>([
    ['proxy', { proxy: { server: 'http://x' } }],
    ['serviceWorkers', { serviceWorkers: 'allow' }],
  ])('rejects a caller %s override', async (_name, extra) => {
    await expect(newGuardedContext(browser, { allowedHosts: effectiveHosts([]) }, extra)).rejects.toThrow(TypeError);
  });

  it.each([['a.test,evil.com'], ['<-loopback>'], ['*']])('rejects a host entry that could widen the bypass (%s)', async (entry) => {
    await expect(newGuardedContext(browser, { allowedHosts: [...effectiveHosts([]), entry] })).rejects.toThrow(TypeError);
  });
});
