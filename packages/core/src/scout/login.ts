import { errors, type Locator, type Page } from 'playwright-core';
import type { AccountConfig, Target } from '../config/schema.js';
import type { Redactor } from '../config/redact.js';
import { remaining } from './capture.js';

export type LoginResult = { ok: true } | { ok: false; reason: string };

const POLL_MS = 100;
const GRACE_MS = 500;
const USERNAME_CSS = [
  'input[type=email]',
  'input[autocomplete=username]',
  'input[name*=user i]',
  'input[id*=user i]',
  'input[name*=email i]',
  'input[id*=email i]',
  'input[name*=login i]',
].join(', ');
const SUBMIT_NAME = /log ?in|sign ?in|submit|continue/i;

/** `pathname` is `loginRoute` or below it (`/login/failed`). `/` only matches itself. */
export function isUnderLoginRoute(pathname: string, loginRoute: string): boolean {
  const base = loginRoute.replace(/\/+$/, '');
  return pathname === loginRoute || (base !== '' && (pathname === base || pathname.startsWith(`${base}/`)));
}

/** The locator for a D-15 target, resolved exactly as plans will be. */
export function locateTarget(page: Page, target: Target): Locator {
  if ('role' in target) return page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.name, exact: true });
  if ('label' in target) return page.getByLabel(target.label, { exact: true });
  if ('text' in target) return page.getByText(target.text, { exact: true });
  return page.getByTestId(target.testId);
}

const firstLine = (s: string) => s.split('\n')[0]?.trim() ?? '';

class LoginFailure extends Error {}

async function field(page: Page, key: 'username' | 'password' | 'submit', account: AccountConfig): Promise<Locator> {
  const override = account.fields?.[key];
  if (override) {
    const loc = locateTarget(page, override);
    const n = await loc.count();
    if (n !== 1) throw new LoginFailure(`fields.${key} override matched ${n} elements`);
    return loc;
  }
  const candidates: Locator[] =
    key === 'username'
      ? [page.locator(USERNAME_CSS), page.locator('input[type=text], input:not([type])')]
      : key === 'password'
        ? [page.locator('input[type=password]')]
        : [page.getByRole('button', { name: SUBMIT_NAME }), page.locator('form [type=submit]')];
  for (const c of candidates) {
    const visible = c.filter({ visible: true }).first();
    if ((await visible.count()) > 0) return visible;
  }
  throw new LoginFailure(`no ${key} field found on ${account.loginRoute}`);
}

/**
 * Fills and submits the login form (D-20, D-30). Success: no visible password field remains and the page
 * is off the `loginRoute` subtree or exactly on `loginRoute` (in-place SPA login). Fails fast once a page
 * load or an alert shows the attempt didn't work. Reasons are redacted.
 */
export async function login(
  page: Page,
  account: AccountConfig,
  opts: { origin: string; deadline: number; redactor: Redactor },
): Promise<LoginResult> {
  const { deadline, redactor } = opts;
  const started = Date.now();
  const fail = (reason: string): LoginResult => ({ ok: false, reason: redactor.redact(reason) });
  try {
    const response = await page.goto(new URL(account.loginRoute, opts.origin).href, { timeout: remaining(deadline, 'login') });
    const status = response?.status();
    if (status !== undefined && status >= 400) return fail(`login page ${account.loginRoute} returned HTTP ${status}`);
    await waitForForm(page, account, deadline);
    const username = await field(page, 'username', account);
    const password = await field(page, 'password', account);
    const submit = await field(page, 'submit', account);
    await username.fill(account.username, { timeout: remaining(deadline, 'login') });
    await password.fill(account.password, { timeout: remaining(deadline, 'login') });

    let loaded = false;
    let inFlight = 0;
    const onLoad = () => (loaded = true);
    const onRequest = () => inFlight++;
    const onDone = () => (inFlight = Math.max(0, inFlight - 1));
    page.on('load', onLoad);
    page.on('request', onRequest);
    page.on('requestfinished', onDone);
    page.on('requestfailed', onDone);
    try {
      await submit.click({ timeout: remaining(deadline, 'login') });
      let failingSince: number | undefined;
      let inPlaceSince: number | undefined;
      for (;;) {
        const state = await readState(page);
        if (state) {
          const { pathname, passwordVisible, alert } = state;
          if (!passwordVisible && !isUnderLoginRoute(pathname, account.loginRoute)) return { ok: true };
          // In place, the form may only be hidden behind a spinner: success must hold, quiet, for the grace period.
          const inPlace = !passwordVisible && alert === null && pathname === account.loginRoute && inFlight === 0;
          inPlaceSince = inPlace ? (inPlaceSince ?? Date.now()) : undefined;
          if (inPlaceSince !== undefined && Date.now() - inPlaceSince >= GRACE_MS) return { ok: true };
          if (!inPlace && (loaded || alert !== null)) {
            failingSince ??= Date.now();
            if (Date.now() - failingSince >= GRACE_MS) {
              return fail(
                alert ? `login failed on ${pathname}: ${firstLine(alert)}` : `login failed: still on ${pathname} after submit`,
              );
            }
          }
        }
        if (Date.now() + POLL_MS >= deadline) throw new errors.TimeoutError('login budget spent');
        await page.waitForTimeout(POLL_MS);
      }
    } finally {
      page.off('load', onLoad);
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    }
  } catch (err) {
    if (err instanceof LoginFailure) return fail(err.message);
    if (err instanceof errors.TimeoutError) return fail(`login timed out after ${Date.now() - started} ms`);
    return fail(`login failed: ${firstLine(err instanceof Error ? err.message : String(err))}`);
  }
}

/** Waits until the password field (or its override) is visible, for forms rendered after load. Gives up quietly. */
async function waitForForm(page: Page, account: AccountConfig, deadline: number): Promise<void> {
  const target = account.fields?.password;
  const loc = target ? locateTarget(page, target) : page.locator('input[type=password]');
  try {
    await loc.filter({ visible: true }).first().waitFor({ state: 'visible', timeout: remaining(deadline, 'login form') });
  } catch (err) {
    if (!(err instanceof errors.TimeoutError)) throw err;
  }
}

/** Null while the page is mid-navigation. */
async function readState(page: Page): Promise<{ pathname: string; passwordVisible: boolean; alert: string | null } | null> {
  try {
    const pathname = new URL(page.url()).pathname;
    const passwordVisible = (await page.locator('input[type=password]').filter({ visible: true }).count()) > 0;
    const alerts = page.getByRole('alert').filter({ visible: true });
    const alert = (await alerts.count()) > 0 ? await alerts.first().innerText({ timeout: 200 }) : null;
    return { pathname, passwordVisible, alert };
  } catch {
    return null;
  }
}
