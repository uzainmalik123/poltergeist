import type { BrowserContext, Page } from 'playwright-core';
import type { Assertion } from '../compiler/dsl.js';
import type { Redactor } from '../config/redact.js';
import { isAllowedHost, normalizeHost } from '../safety/allowlist.js';
import type { ForbiddenMatcher } from '../safety/forbidden.js';
import { locateTarget } from '../scout/login.js';
import { evalJsonPath, pathMatches } from './match.js';
import type { AssertionResult } from './types.js';

export type ConsoleRecord = { text: string; url: string };

export type AssertEnv = {
  /** Actor a's page. */
  page: Page;
  /** Actor a's context; `api` assertions use its cookies. */
  context: BrowserContext;
  origin: string;
  allowedHosts: readonly string[];
  forbidden: ForbiddenMatcher;
  redactor: Redactor;
  /** Console errors from every actor's pages. */
  consoleErrors: readonly ConsoleRecord[];
  pageErrors: readonly string[];
  /** URLs the guard stopped during the rep. */
  blockedUrls: ReadonlySet<string>;
  pollMs: number;
  /** Epoch ms; the plan budget. */
  deadline: number;
};

/** How long text, count and URL assertions keep polling for the expected state (D-33). */
export const ASSERT_POLL_MS = 2000;
const POLL_EVERY_MS = 100;
const API_TIMEOUT_MS = 5000;
const MAX_DETAIL = 200;

class PlanFault extends Error {}

/**
 * Text assertions match case-sensitively on whole words (D-33): `Error` must not match "No errors", and
 * `1 claimed` must not match "11 claimed". Playwright's plain string match is a case-insensitive substring.
 */
function wholeWords(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u');
}

const trim = (s: string) => (s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL)}…` : s);
const firstLine = (s: string) => s.split('\n')[0]?.trim() ?? '';

/** Polls `check` until it returns true or time runs out; returns the last value. */
async function poll(check: () => Promise<boolean>, until: number): Promise<boolean> {
  for (;;) {
    if (await check()) return true;
    if (Date.now() + POLL_EVERY_MS > until) return false;
    await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
  }
}

type Outcome = { ok: boolean; detail: string; failure?: AssertionResult['failure'] };

async function evaluate(a: Assertion, env: AssertEnv): Promise<Outcome> {
  const { page } = env;
  const until = Math.min(Date.now() + env.pollMs, env.deadline);
  const visible = (text: string) => page.getByText(wholeWords(text)).filter({ visible: true }).count();

  if ('textVisible' in a) {
    const ok = await poll(async () => (await visible(a.textVisible)) > 0, until);
    return ok ? { ok, detail: `"${a.textVisible}" is visible` } : { ok, detail: `"${a.textVisible}" never became visible`, failure: 'app' };
  }
  if ('textNotVisible' in a) {
    const ok = await poll(async () => (await visible(a.textNotVisible)) === 0, until);
    return ok ? { ok, detail: `"${a.textNotVisible}" is not visible` } : { ok, detail: `"${a.textNotVisible}" is still visible`, failure: 'app' };
  }
  if ('urlMatches' in a) {
    const path = () => new URL(page.url()).pathname;
    const ok = await poll(async () => pathMatches(a.urlMatches, path()), until);
    return ok ? { ok, detail: `on ${path()}` } : { ok, detail: `on ${path()}, expected ${a.urlMatches}`, failure: 'app' };
  }
  if ('elementCount' in a) {
    const { target, equals } = a.elementCount;
    let n = 0;
    const ok = await poll(async () => (n = await locateTarget(page, target).count()) === equals, until);
    return ok ? { ok, detail: `${n} found` } : { ok, detail: `${n} found, expected ${equals}`, failure: 'app' };
  }
  if ('api' in a) return api(a.api, env);
  if ('noConsoleErrors' in a) {
    // Chromium reports a failed load at the resource's URL, so the guard's own blocks are exactly these.
    const real = env.consoleErrors.filter((c) => !env.blockedUrls.has(c.url));
    return real.length === 0
      ? { ok: true, detail: 'no console errors' }
      : { ok: false, detail: `${real.length} console error(s): ${firstLine(real[0]!.text)}`, failure: 'app' };
  }
  return env.pageErrors.length === 0
    ? { ok: true, detail: 'no uncaught exceptions' }
    : { ok: false, detail: `${env.pageErrors.length} uncaught exception(s): ${firstLine(env.pageErrors[0]!)}`, failure: 'app' };
}

async function api(spec: Extract<Assertion, { api: unknown }>['api'], env: AssertEnv): Promise<Outcome> {
  const url = new URL(spec.path, env.origin);
  if (!isAllowedHost(normalizeHost(url.hostname), env.allowedHosts)) {
    return { ok: false, detail: `${spec.method} ${spec.path} leaves the allowlist; not sent`, failure: 'blocked' };
  }
  if (env.forbidden(spec.method, url.href)) {
    return { ok: false, detail: `${spec.method} ${spec.path} matches a forbidden rule; not sent`, failure: 'blocked' };
  }
  // No redirects: a hop could reach a `forbidden` path that was only checked for the first URL (Req 2.5).
  const res = await env.context.request.fetch(url.href, {
    method: spec.method,
    failOnStatusCode: false,
    maxRedirects: 0,
    timeout: API_TIMEOUT_MS,
  });
  const status = res.status();
  if (spec.status !== undefined && status !== spec.status) {
    return { ok: false, detail: `${spec.method} ${spec.path} returned ${status}, expected ${spec.status}`, failure: 'app' };
  }
  if (spec.jsonPath === undefined) return { ok: true, detail: `${spec.method} ${spec.path} returned ${status}` };
  let body: unknown;
  try {
    body = JSON.parse(await res.text());
  } catch {
    return { ok: false, detail: `${spec.method} ${spec.path} did not return JSON (${status})`, failure: 'app' };
  }
  const r = evalJsonPath(body, spec.jsonPath);
  if (!r.found) {
    if (r.error.startsWith('unsupported')) throw new PlanFault(r.error);
    return { ok: false, detail: r.error, failure: 'app' };
  }
  if (spec.equals === undefined) return { ok: true, detail: `${spec.jsonPath} = ${JSON.stringify(r.value)}` };
  const ok = r.value === spec.equals;
  const detail = `${spec.jsonPath} = ${JSON.stringify(r.value)}${ok ? '' : `, expected ${JSON.stringify(spec.equals)}`}`;
  return ok ? { ok, detail } : { ok, detail, failure: 'app' };
}

/**
 * Evaluates a plan's assertions after every actor is done (D-33). Text, count and URL assertions poll up to
 * `pollMs`; `api` assertions never send to a host outside the allowlist or a `forbidden` path. A Playwright
 * error inside an assertion is the plan's fault, not the app's.
 */
export async function runAssertions(asserts: readonly Assertion[], env: AssertEnv): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  for (const [index, a] of asserts.entries()) {
    const type = Object.keys(a)[0]!;
    let out: Outcome;
    try {
      out = await evaluate(a, env);
    } catch (err) {
      out = { ok: false, detail: firstLine(err instanceof Error ? err.message : String(err)), failure: 'plan' };
    }
    results.push({ index, type, ok: out.ok, detail: trim(env.redactor.redact(out.detail)), ...(out.failure ? { failure: out.failure } : {}) });
  }
  return results;
}
