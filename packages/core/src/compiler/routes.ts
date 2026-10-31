import type { Criterion } from '../spec/types.js';
import type { RouteScout } from '../scout/types.js';

/** At most two routes per criterion (Req 5.1, KI-03). */
export const MAX_ROUTES = 2;

export const STOP_WORDS: ReadonlySet<string> = new Set(
  ('the and for with that this from into each every when while where then shall should must not are its their ' +
    'user system app page can has have been will only one any all').split(' '),
);

/** Lowercased word tokens (≥ 3 chars, no stop words), with one trailing `s` stripped from longer words. */
export function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    out.add(raw.length > 3 && raw.endsWith('s') ? raw.slice(0, -1) : raw);
  }
  return out;
}

function routeTokens(r: RouteScout): Set<string> {
  const parts = [r.path, r.title ?? ''];
  for (const e of r.interactive) parts.push(e.name, e.label ?? '', e.testId ?? '');
  for (const t of r.testIds) parts.push(t.testId, t.name ?? '');
  return tokenize(parts.join(' '));
}

/**
 * Deterministic route picking (D-32): score each `ok` route by token overlap with the criterion,
 * keep the top two with a score above zero, ties in config order.
 */
export function pickRoutes(criterion: Criterion, routes: readonly RouteScout[]): RouteScout[] {
  const wanted = tokenize(criterion.text);
  return routes
    .map((route, index) => {
      let score = 0;
      if (route.status === 'ok') for (const t of routeTokens(route)) if (wanted.has(t)) score++;
      return { route, index, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_ROUTES)
    .map((s) => s.route);
}
