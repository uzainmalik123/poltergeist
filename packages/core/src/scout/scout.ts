import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { errors, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { LoadedConfig } from '../config/load.js';
import type { RouteConfig } from '../config/schema.js';
import { newGuardedContext, type BlockedRequest } from '../safety/guard.js';
import { captureRoute, remaining } from './capture.js';
import { routeHash, scoutHash } from './hash.js';
import { login } from './login.js';
import { slugsFor } from './slug.js';
import { trimForPrompt } from './trim.js';
import type { RouteScout, RouteStatus, ScoutOptions, ScoutResult, StorageState } from './types.js';

const ANONYMOUS = 'anonymous';
const CAPTURE_SHARE = 0.2;

const identityOf = (auth: RouteConfig['auth']) => (auth === false ? ANONYMOUS : auth === true ? 'default' : auth);
const firstLine = (err: unknown) => (err instanceof Error ? err.message : String(err)).split('\n')[0]?.trim() ?? '';

type Visit = Omit<RouteScout, 'path' | 'slug' | 'identity' | 'routeHash' | 'blocked'>;
/** `replacePage`: the page may be stuck (load or capture failed), so the next route gets a fresh one. */
type Outcome = { visit: Visit; replacePage: boolean };

const empty = (status: RouteStatus, reason: string, settled = false): Visit => ({
  status,
  reason,
  settled,
  interactive: [],
  testIds: [],
  snapshot: '',
  snapshotFull: '',
  trimmed: false,
});

/**
 * Visits every configured route as its identity and writes `outDir/scout/<slug>.json` (Req 3, D-20, D-21, D-30).
 * One guarded context per identity, one at a time: anonymous first, then accounts in order of first use.
 * Sessions are returned in memory only. The caller launches Chromium with `guardLaunchOptions()`.
 */
export async function scout(browser: Browser, loaded: LoadedConfig, opts: ScoutOptions): Promise<ScoutResult> {
  const { config, redactor } = loaded;
  const origin = new URL(config.target).origin;
  const routeTimeoutMs = opts.routeTimeoutMs ?? 10000;
  const loginTimeoutMs = opts.loginTimeoutMs ?? 10000;
  // A path scouted under two identities gets one file per identity (`market_anonymous`, `market_default`).
  const uses = new Map<string, number>();
  for (const r of config.routes) uses.set(r.path, (uses.get(r.path) ?? 0) + 1);
  const keys = config.routes.map((r) => ((uses.get(r.path) ?? 0) > 1 ? `${r.path} ${identityOf(r.auth)}` : r.path));
  const slugs = slugsFor(keys);
  const scoutDir = join(opts.outDir, 'scout');
  await mkdir(scoutDir, { recursive: true });

  const identities = [...new Set(config.routes.map((r) => identityOf(r.auth)))].sort(
    (a, b) => Number(b === ANONYMOUS) - Number(a === ANONYMOUS),
  );
  const results: RouteScout[] = new Array<RouteScout>(config.routes.length);
  const sessions = new Map<string, StorageState>();

  const redactBlocked = (b: BlockedRequest): BlockedRequest => ({
    ...b,
    url: redactor.redact(b.url),
    host: redactor.redact(b.host),
    ...(b.errorText === undefined ? {} : { errorText: redactor.redact(b.errorText) }),
  });

  for (const identity of identities) {
    let blocked: BlockedRequest[] = [];
    const context = await newGuardedContext(browser, {
      allowedHosts: loaded.allowedHosts,
      forbidden: config.forbidden,
      onBlocked: (b) => {
        const r = redactBlocked(b);
        blocked.push(r);
        opts.onBlocked?.(r);
      },
    });
    try {
      let page = await context.newPage();
      const account = identity === ANONYMOUS ? undefined : loaded.config.accounts[identity];
      let loginFailure: string | undefined;
      if (account) {
        const r = await login(page, account, { origin, deadline: Date.now() + loginTimeoutMs, redactor });
        if (r.ok) sessions.set(identity, await context.storageState());
        else loginFailure = r.reason;
      }
      for (const [i, route] of config.routes.entries()) {
        if (identityOf(route.auth) !== identity) continue;
        blocked = [];
        let outcome: Outcome;
        if (!account && identity !== ANONYMOUS) outcome = skip(`account "${identity}" is not usable`);
        else if (loginFailure !== undefined) outcome = skip(loginFailure);
        else outcome = await visitRoute(page, route.path, { origin, routeTimeoutMs, loginRoute: account?.loginRoute, loaded });
        if (outcome.replacePage) page = await freshPage(context, page);
        const rest = outcome.visit;
        const scouted: RouteScout = {
          path: route.path,
          slug: slugs.get(keys[i] as string) as string,
          identity,
          ...rest,
          ...(rest.reason === undefined ? {} : { reason: redactor.redact(rest.reason) }),
          ...(rest.finalPath === undefined ? {} : { finalPath: redactor.redact(rest.finalPath) }),
          routeHash: routeHash(rest.status, rest.interactive, rest.testIds),
          blocked,
        };
        results[i] = scouted;
        await writeFile(join(scoutDir, `${scouted.slug}.json`), `${JSON.stringify(scouted, null, 2)}\n`);
        opts.onRoute?.(scouted);
      }
    } finally {
      await context.close();
    }
  }
  return { routes: results, scoutHash: scoutHash(results), sessions };
}

const skip = (reason: string): Outcome => ({ visit: empty('authFailed', reason), replacePage: false });
const done = (visit: Visit, replacePage = false): Outcome => ({ visit, replacePage });

async function freshPage(context: BrowserContext, page: Page): Promise<Page> {
  await page.close().catch(() => undefined);
  return context.newPage();
}

async function visitRoute(
  page: Page,
  path: string,
  o: { origin: string; routeTimeoutMs: number; loginRoute: string | undefined; loaded: LoadedConfig },
): Promise<Outcome> {
  const start = Date.now();
  const deadline = start + o.routeTimeoutMs;
  const navDeadline = deadline - CAPTURE_SHARE * o.routeTimeoutMs;
  const url = new URL(path, o.origin);

  let status: number | undefined;
  try {
    const response = await page.goto(url.href, { waitUntil: 'load', timeout: remaining(navDeadline, 'load') });
    status = response?.status();
  } catch (err) {
    const reason = err instanceof errors.TimeoutError ? `load timed out after ${Date.now() - start} ms` : firstLine(err);
    return done(empty('unreachable', reason), true);
  }
  if (status !== undefined && status >= 400) return done(empty('unreachable', `HTTP ${status}`, true));

  let settled = false;
  try {
    const left = navDeadline - Date.now();
    if (left > 0) {
      await page.waitForLoadState('networkidle', { timeout: left });
      settled = true;
    }
  } catch {
    settled = false;
  }

  const finalPath = new URL(page.url()).pathname;
  if (o.loginRoute !== undefined && finalPath === o.loginRoute) {
    return done({ ...empty('authFailed', `session lost: redirected to ${o.loginRoute}`, settled), finalPath });
  }
  const routeStatus: RouteStatus = finalPath === url.pathname ? 'ok' : 'redirected';

  try {
    const c = await captureRoute(page, { deadline, redactor: o.loaded.redactor });
    const trimmed = trimForPrompt(c);
    return done({
      status: routeStatus,
      ...(routeStatus === 'redirected' ? { reason: `redirected to ${finalPath}` } : {}),
      finalPath,
      title: c.title,
      settled,
      interactive: trimmed.interactive,
      testIds: trimmed.testIds,
      snapshot: trimmed.snapshot,
      snapshotFull: c.snapshotFull,
      trimmed: trimmed.trimmed,
    });
  } catch (err) {
    return done({ ...empty('unreachable', `capture failed: ${firstLine(err)}`, settled), finalPath }, true);
  }
}
