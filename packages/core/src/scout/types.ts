import type { BrowserContext } from 'playwright-core';
import type { BlockedRequest } from '../safety/guard.js';

export type RouteStatus = 'ok' | 'redirected' | 'unreachable' | 'authFailed';

/** One interactive element from the aria snapshot. Same role and name are merged into `count`. */
export type InteractiveElement = { role: string; name: string; count: number; label?: string; testId?: string };

/** A testId that resolves to exactly one element but isn't attached to an interactive entry. */
export type TestIdElement = { testId: string; role?: string; name?: string };

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** The content of `scout/<slug>.json` (D-20, D-21, D-30). */
export type RouteScout = {
  path: string;
  slug: string;
  /** `anonymous` or the account name. */
  identity: string;
  status: RouteStatus;
  reason?: string;
  finalPath?: string;
  title?: string;
  /** False when `networkidle` didn't arrive within the budget. */
  settled: boolean;
  interactive: InteractiveElement[];
  testIds: TestIdElement[];
  /** Prompt-facing, trimmed to the budget. */
  snapshot: string;
  /** Redacted but untrimmed, for debugging and replay. */
  snapshotFull: string;
  trimmed: boolean;
  routeHash: string;
  blocked: BlockedRequest[];
};

export type ScoutOptions = {
  outDir: string;
  routeTimeoutMs?: number;
  loginTimeoutMs?: number;
  /** Called in visit order (anonymous first, then accounts). */
  onRoute?: (route: RouteScout) => void;
  onBlocked?: (blocked: BlockedRequest) => void;
};

export type ScoutResult = {
  /** In config order. */
  routes: RouteScout[];
  scoutHash: string;
  /** Per account, in memory only (Req 3.3). */
  sessions: Map<string, StorageState>;
};
