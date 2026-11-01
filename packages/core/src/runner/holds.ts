import type { BrowserContext } from 'playwright-core';
import { requestMatches } from './match.js';

export type Holds = {
  hold(pattern: string): void;
  release(pattern: string): void;
  releaseAll(): void;
  /** Requests currently parked for `pattern`. */
  held(pattern: string): number;
};

/**
 * `holdRequests` / `releaseRequests` (Req 6.4, D-33). Install AFTER `newGuardedContext`: route handlers
 * run newest first, so this one sees each request before the guard and hands it on with `fallback()`,
 * where the guard still applies its allowlist and `forbidden` rules.
 */
export async function installHolds(context: BrowserContext, origin: string): Promise<Holds> {
  const active = new Map<string, (() => void)[]>();

  await context.route('**/*', async (route) => {
    const request = route.request();
    const pattern = [...active.keys()].find((p) => requestMatches(p, request.method(), request.url(), origin));
    if (pattern !== undefined) {
      await new Promise<void>((resolve) => active.get(pattern)!.push(resolve));
    }
    await route.fallback().catch(() => undefined); // the page may be gone by release time
  });

  const release = (pattern: string) => {
    const parked = active.get(pattern);
    active.delete(pattern);
    for (const go of parked ?? []) go();
  };

  return {
    hold(pattern) {
      if (!active.has(pattern)) active.set(pattern, []);
    },
    release,
    releaseAll() {
      for (const p of [...active.keys()]) release(p);
    },
    held(pattern) {
      return active.get(pattern)?.length ?? 0;
    },
  };
}
