import { chromium, errors, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Redactor } from '../../src/config/redact.js';
import { effectiveHosts } from '../../src/safety/allowlist.js';
import { guardLaunchOptions, newGuardedContext } from '../../src/safety/guard.js';
import { captureRoute } from '../../src/scout/capture.js';
import { PASSWORD, SESSION, startCandyFixture, type CandyFixture } from './candy-fixture.js';

let browser: Browser;
let fixture: CandyFixture;
let context: BrowserContext | undefined;
const redactor = new Redactor([PASSWORD]);

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

async function openAuthed(path: string): Promise<Page> {
  context = await newGuardedContext(browser, { allowedHosts: effectiveHosts([]) });
  await context.addCookies([{ name: 'sid', value: SESSION, url: fixture.origin }]);
  const page = await context.newPage();
  await page.goto(`${fixture.origin}${path}`);
  return page;
}

const soon = () => Date.now() + 5000;

describe('captureRoute', () => {
  it('lists the market buttons with merged duplicates and attached testIds', async () => {
    const page = await openAuthed('/market');
    const c = await captureRoute(page, { deadline: soon(), redactor });
    expect(c.title).toBe('Market');
    expect(c.interactive).toContainEqual({ role: 'button', name: 'Claim Sour Skulls', count: 1, testId: 'claim-sour-skulls' });
    expect(c.interactive).toContainEqual({ role: 'button', name: 'Claim Candy Corn', count: 2 });
    expect(c.testIds.map((t) => t.testId)).toContain('market-status');
    expect(c.testIds.map((t) => t.testId)).not.toContain('candy-card');
  });

  it('never emits a secret and drops elements that would change under redaction', async () => {
    const page = await openAuthed('/market');
    const c = await captureRoute(page, { deadline: soon(), redactor });
    expect(JSON.stringify(c)).not.toContain(PASSWORD);
    expect(c.interactive.some((e) => e.name.includes('[REDACTED]'))).toBe(false);
    expect(c.testIds.some((t) => t.testId.includes('[REDACTED]'))).toBe(false);
    expect(c.snapshotFull).toContain('[REDACTED]');
  });

  it('labels the trade form fields', async () => {
    const page = await openAuthed('/trade/new');
    const c = await captureRoute(page, { deadline: soon(), redactor });
    expect(c.interactive).toContainEqual({ role: 'textbox', name: 'Offer', count: 1, label: 'Offer' });
    expect(c.interactive).toContainEqual({ role: 'combobox', name: 'Want', count: 1, label: 'Want' });
    expect(c.interactive).toContainEqual({ role: 'textbox', name: 'Note', count: 1, label: 'Note' });
    expect(c.interactive).toContainEqual({ role: 'button', name: 'Propose trade', count: 1 });
    expect(c.testIds.map((t) => t.testId)).toContain('trade-status');
  });

  it('emits only labels and testIds that resolve to exactly one element (Req 3.4)', async () => {
    for (const path of ['/market', '/trade/new']) {
      const page = await openAuthed(path);
      const c = await captureRoute(page, { deadline: soon(), redactor });
      for (const e of c.interactive) {
        if (e.label) expect(await page.getByLabel(e.label, { exact: true }).count()).toBe(1);
        if (e.testId) expect(await page.getByTestId(e.testId).count()).toBe(1);
      }
      for (const t of c.testIds) expect(await page.getByTestId(t.testId).count()).toBe(1);
      await context?.close();
      context = undefined;
    }
  });

  it('throws a TimeoutError when the deadline has passed', async () => {
    const page = await openAuthed('/market');
    await expect(captureRoute(page, { deadline: Date.now() - 1, redactor })).rejects.toBeInstanceOf(errors.TimeoutError);
  });

  it('degrades testIds instead of failing when lookups time out', async () => {
    const page = await openAuthed('/market');
    const c = await captureRoute(page, { deadline: soon(), redactor, testIdTimeoutMs: 1 });
    expect(c.testIds.map((t) => t.testId)).toContain('market-status');
  });
});
