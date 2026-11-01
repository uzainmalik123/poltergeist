import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { applyThrottle, THROTTLE_PRESETS } from '../../src/runner/throttle.js';
import { startFrames } from '../../src/runner/frames.js';
import { installHolds } from '../../src/runner/holds.js';
import { installOverlay, moveCursor, OVERLAY_COLOR } from '../../src/runner/overlay.js';
import { guardLaunchOptions, newGuardedContext } from '../../src/safety/guard.js';
import { sessionState, startClaimsFixture, type ClaimsFixture } from './claims-fixture.js';

let browser: Browser;
let fixture: ClaimsFixture;
let context: BrowserContext;
let page: Page;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
});

async function open(opts: { forbidden?: { method: string; path: string }[] } = {}) {
  context = await newGuardedContext(
    browser,
    { allowedHosts: ['localhost', '127.0.0.1', '::1'], forbidden: opts.forbidden },
    { storageState: sessionState(fixture.origin) },
  );
  page = await context.newPage();
}

describe('installHolds', () => {
  it('parks matching requests until released', async () => {
    await open();
    const holds = await installHolds(context, fixture.origin);
    holds.hold('POST /api/claims');
    await page.goto(`${fixture.origin}/claims`);
    const before = fixture.arrivals().length;
    await page.getByRole('button', { name: 'Claim Candy 1', exact: true }).click();
    await sleep(300);
    expect(fixture.arrivals().length).toBe(before);
    expect(holds.held('POST /api/claims')).toBe(1);
    holds.release('POST /api/claims');
    await page.getByText('Claimed!').waitFor();
    expect(fixture.arrivals().length).toBe(before + 1);
    expect(holds.held('POST /api/claims')).toBe(0);
  });

  it('releaseAll lets everything go, and unmatched requests pass straight through', async () => {
    await open();
    const holds = await installHolds(context, fixture.origin);
    holds.hold('POST /api/claims');
    await page.goto(`${fixture.origin}/claims`);
    const status = await page.evaluate(() => fetch('/api/candies/x').then((r) => r.status));
    expect(status).toBe(200);
    await page.getByRole('button', { name: 'Claim Candy 4', exact: true }).click();
    await sleep(100);
    holds.releaseAll();
    await page.getByText(/Claimed!|Already claimed/).first().waitFor();
  });

  it('hands released requests to the guard, which still blocks forbidden ones', async () => {
    await open({ forbidden: [{ method: 'DELETE', path: '/api/admin/*' }] });
    const holds = await installHolds(context, fixture.origin);
    holds.hold('DELETE /api/admin/all');
    await page.goto(`${fixture.origin}/admin`);
    await page.getByRole('button', { name: 'Delete all' }).click();
    await sleep(100);
    expect(holds.held('DELETE /api/admin/all')).toBe(1);
    holds.release('DELETE /api/admin/all');
    await sleep(200);
    expect(fixture.seen()).not.toContain('DELETE /api/admin/all');
  });
});

describe('installOverlay', () => {
  it('adds no accessible or text nodes and does not block clicks', async () => {
    await open();
    await page.goto(`${fixture.origin}/claims`);
    const aria = await page.locator('body').ariaSnapshot();
    const texts = await page.getByText(/./).count();
    await context.close();

    await open();
    await installOverlay(context);
    await page.goto(`${fixture.origin}/claims`);
    await moveCursor(page, 10, 20);
    expect(await page.locator('body').ariaSnapshot()).toBe(aria);
    expect(await page.getByText(/./).count()).toBe(texts);
    const host = await page.evaluate(`(() => {
      const el = document.querySelector('poltergeist-ghost');
      return el ? { closed: el.shadowRoot === null, hidden: el.getAttribute('aria-hidden') } : null;
    })()`);
    expect(host).toEqual({ closed: true, hidden: 'true' });
    const box = (await page.getByRole('button', { name: 'Claim Candy 2', exact: true }).boundingBox())!;
    await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2);
    await page.getByRole('button', { name: 'Claim Candy 2', exact: true }).click();
    await page.getByText('Claimed!').waitFor();
  });

  it('uses the ectoplasm colour', () => {
    expect(OVERLAY_COLOR).toBe('#7dffb0');
  });
});

describe('applyThrottle', () => {
  it('pins the DevTools presets', () => {
    expect(THROTTLE_PRESETS['slow-3g']).toEqual({ latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 });
    expect(THROTTLE_PRESETS['fast-3g']).toEqual({ latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 });
  });

  it('slows requests down', async () => {
    await open();
    await page.goto(`${fixture.origin}/claims`);
    await applyThrottle(page, 'slow-3g');
    const ms = await page.evaluate(async () => {
      const t = performance.now();
      await fetch('/api/candies/x');
      return performance.now() - t;
    });
    expect(ms).toBeGreaterThanOrEqual(1500);
  });
});

describe('startFrames', () => {
  it('delivers JPEG frames at no more than the requested rate, and stops', async () => {
    await open();
    await page.goto(`${fixture.origin}/anim`);
    const frames: Buffer[] = [];
    const stop = await startFrames(page, 2, (f) => frames.push(f));
    await sleep(1600);
    await stop();
    const n = frames.length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
    expect([frames[0]![0], frames[0]![1]]).toEqual([0xff, 0xd8]);
    await sleep(300);
    expect(frames.length).toBe(n);
  });
});
