import { createServer } from 'node:net';
import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Request } from 'playwright-core';
import type { ForbiddenRule } from '../config/schema.js';
import { isAllowedHost, isValidHostEntry, normalizeHost } from './allowlist.js';
import { compileForbidden, type ForbiddenMatcher } from './forbidden.js';

export type BlockReason = 'host' | 'forbidden' | 'scheme' | 'redirect' | 'leak';

export type BlockedRequest = {
  url: string;
  host: string;
  method: string;
  resourceType: string;
  reason: BlockReason;
  /** The `forbidden` rule that matched (reason `forbidden`). */
  rule?: ForbiddenRule;
  /** The browser's failure text, when the block was seen as a failed request. */
  errorText?: string;
};

export type GuardOptions = {
  /** The effective allowlist: loopback defaults plus `allowedHosts` (`LoadedConfig.allowedHosts`). */
  allowedHosts: readonly string[];
  forbidden?: readonly ForbiddenRule[];
  /** Called after the request is already stopped. Errors it throws are swallowed. */
  onBlocked?: (blocked: BlockedRequest) => void;
};

const PROXY_FAILED = 'net::ERR_PROXY_CONNECTION_FAILED';
const BLOCKED_BY_CLIENT = 'net::ERR_BLOCKED_BY_CLIENT';
const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);
const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:']);
const WEBRTC_FLAG = '--force-webrtc-ip-handling-policy=disable_non_proxied_udp';

/** Chromium launch options that keep WebRTC off non-proxied UDP (D-18). Use for every browser. */
export function guardLaunchOptions(extra: LaunchOptions = {}): LaunchOptions {
  return { ...extra, args: [...(extra.args ?? []), WEBRTC_FLAG] };
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Classifies a request the route handler never aborted (redirect hops, D-18/D-22):
 * - off-allowlist and stopped by the dead proxy or the client → `host`; any other failure → `leak`;
 * - allowlisted but failed at the dead proxy → `redirect` (only a hidden redirect hop can get there);
 * - anything else → null.
 */
export function classifyRequestFailure(
  f: { url: string; method: string; resourceType: string; errorText: string },
  allowedHosts: readonly string[],
): BlockedRequest | null {
  const url = parse(f.url);
  if (!url || !NETWORK_SCHEMES.has(url.protocol)) return null;
  const host = normalizeHost(url.hostname);
  const base = { url: f.url, host, method: f.method, resourceType: f.resourceType, errorText: f.errorText };
  if (!isAllowedHost(host, allowedHosts)) {
    const stopped = f.errorText.includes(PROXY_FAILED) || f.errorText.includes(BLOCKED_BY_CLIENT);
    return { ...base, reason: stopped ? 'host' : 'leak' };
  }
  return f.errorText.includes(PROXY_FAILED) ? { ...base, reason: 'redirect' } : null;
}

/** A local port with nothing listening on it: every proxied connection fails. */
async function deadPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === 'string') throw new Error('could not reserve a dead proxy port');
  return address.port;
}

/** `<-loopback>` first, so Chromium's implicit loopback/link-local bypass is gone; last match wins (D-18). */
function bypassList(hosts: readonly string[]): string {
  for (const h of hosts) {
    if (!isValidHostEntry(h)) throw new TypeError(`invalid allowlist entry for the guard: ${JSON.stringify(h)}`);
  }
  return ['<-loopback>', ...hosts.map((h) => (h.includes(':') ? `[${h}]` : h))].join(',');
}

function disableWebRtc(): void {
  const blocked = function RTCPeerConnection() {
    throw new DOMException('blocked by poltergeist', 'NotAllowedError');
  };
  // Runs in the page; core has no DOM lib, so `globalThis` is the window here.
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    Object.defineProperty(globalThis, name, { value: blocked, writable: false, configurable: false });
  }
}

function installNetworkGuard(context: BrowserContext, opts: GuardOptions): Promise<void> {
  const allowed = opts.allowedHosts;
  const forbidden: ForbiddenMatcher = compileForbidden(opts.forbidden ?? []);
  const aborted = new WeakSet<Request>();
  const report = (b: BlockedRequest) => {
    try {
      opts.onBlocked?.(b);
    } catch {
      // A broken listener must never stall a request or crash the runner (D-18).
    }
  };

  /** Why a request must be stopped, or null if it may go ahead. */
  const verdict = (rawUrl: string, method: string): Pick<BlockedRequest, 'reason' | 'rule' | 'host'> | null => {
    const url = parse(rawUrl);
    if (url && LOCAL_SCHEMES.has(url.protocol)) return null;
    if (!url || !NETWORK_SCHEMES.has(url.protocol)) return { reason: 'scheme', host: url?.hostname ?? '' };
    const host = normalizeHost(url.hostname);
    if (!isAllowedHost(host, allowed)) return { reason: 'host', host };
    const rule = forbidden(method, rawUrl);
    return rule ? { reason: 'forbidden', rule, host } : null;
  };

  context.on('requestfailed', (request) => {
    if (aborted.has(request)) return;
    const b = classifyRequestFailure(
      {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        errorText: request.failure()?.errorText ?? '',
      },
      allowed,
    );
    if (b) report(b);
  });

  context.on('requestfinished', (request) => {
    const url = parse(request.url());
    if (!url || !NETWORK_SCHEMES.has(url.protocol)) return;
    const host = normalizeHost(url.hostname);
    if (isAllowedHost(host, allowed)) return;
    // Should be impossible behind the dead proxy; reported so it can never pass silently.
    report({ url: request.url(), host, method: request.method(), resourceType: request.resourceType(), reason: 'leak' });
  });

  return Promise.all([
    context.route('**/*', async (route) => {
      const request = route.request();
      const v = verdict(request.url(), request.method());
      if (!v) {
        await route.continue();
        return;
      }
      aborted.add(request);
      try {
        await route.abort('blockedbyclient');
      } finally {
        report({ url: request.url(), method: request.method(), resourceType: request.resourceType(), ...v });
      }
    }),
    context.routeWebSocket(/.*/, async (ws) => {
      const v = verdict(ws.url(), 'GET');
      if (!v) {
        ws.connectToServer();
        return;
      }
      try {
        await ws.close({ code: 1008, reason: 'blocked by poltergeist' });
      } finally {
        report({ url: ws.url(), method: 'GET', resourceType: 'websocket', ...v });
      }
    }),
  ]).then(() => undefined);
}

/**
 * The only way to create a browser context (D-18): a dead local proxy whose bypass list is
 * `<-loopback>` plus the allowlist, service workers blocked, WebRTC disabled, and the route guard.
 */
export async function newGuardedContext(
  browser: Browser,
  opts: GuardOptions,
  extra: BrowserContextOptions = {},
): Promise<BrowserContext> {
  if ('proxy' in extra) throw new TypeError('newGuardedContext: callers may not set proxy');
  if ('serviceWorkers' in extra) throw new TypeError('newGuardedContext: callers may not set serviceWorkers');
  const bypass = bypassList(opts.allowedHosts);
  const port = await deadPort();
  const context = await browser.newContext({
    ...extra,
    proxy: { server: `http://127.0.0.1:${port}`, bypass },
    serviceWorkers: 'block',
  });
  try {
    await context.addInitScript(disableWebRtc);
    await installNetworkGuard(context, opts);
  } catch (err) {
    await context.close().catch(() => undefined);
    throw err;
  }
  return context;
}
