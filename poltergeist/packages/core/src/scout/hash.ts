import { createHash } from 'node:crypto';
import type { InteractiveElement, RouteStatus, TestIdElement } from './types.js';

const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const sortedJson = (items: unknown[]) => items.map((i) => JSON.stringify(i)).sort();

/** Over status and elements only, so dynamic text doesn't change it (Req 3.7). */
export function routeHash(
  status: RouteStatus,
  interactive: readonly InteractiveElement[],
  testIds: readonly TestIdElement[],
): string {
  const elements = sortedJson(
    interactive.map(({ role, name, count, label, testId }) => ({ role, name, count, label, testId })),
  );
  const ids = sortedJson(testIds.map(({ testId, role, name }) => ({ testId, role, name })));
  return sha16(JSON.stringify({ status, elements, ids }));
}

/** Run-level hash over every route's hash (Req 3.7). */
export function scoutHash(routes: readonly { path: string; routeHash: string }[]): string {
  return sha16(JSON.stringify(sortedJson(routes.map((r) => [r.path, r.routeHash]))));
}
