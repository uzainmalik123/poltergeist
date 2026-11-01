import type { HauntingPlan, Step } from '../compiler/dsl.js';
import type { BlockedRequest } from '../safety/guard.js';

const JSON_PATH = /^\$((\.[A-Za-z_$][\w$]*)|(\[\d+\]))*$/;
const SEGMENT = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]/g;

/** A small JSON-path subset: `$`, `.key`, `[n]`, and `.length` on arrays and strings (D-33). */
export function evalJsonPath(value: unknown, path: string): { found: true; value: unknown } | { found: false; error: string } {
  if (!JSON_PATH.test(path)) return { found: false, error: `unsupported jsonPath ${JSON.stringify(path)} (use $, .key, [n], .length)` };
  let cur: unknown = value;
  for (const m of path.slice(1).matchAll(SEGMENT)) {
    const [, key, index] = m;
    if (key !== undefined) {
      if (key === 'length' && (Array.isArray(cur) || typeof cur === 'string')) cur = cur.length;
      else if (cur !== null && typeof cur === 'object' && !Array.isArray(cur) && Object.hasOwn(cur, key)) {
        cur = (cur as Record<string, unknown>)[key];
      } else return { found: false, error: `${path}: no "${key}"` };
    } else {
      const i = Number(index);
      if (!Array.isArray(cur) || i >= cur.length) return { found: false, error: `${path}: no [${i}]` };
      cur = cur[i];
    }
  }
  return { found: true, value: cur };
}

/** A pathname glob: `*` matches any characters, everything else is literal. */
export function pathMatches(pattern: string, pathname: string): boolean {
  const re = pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${re}$`).test(pathname);
}

/** Whether a request matches a `holdRequests` pattern (`METHOD /path`): same origin, method and exact pathname. */
export function requestMatches(pattern: string, method: string, url: string, origin: string): boolean {
  const space = pattern.indexOf(' ');
  const [m, p] = [pattern.slice(0, space), pattern.slice(space + 1)];
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.origin === new URL(origin).origin && method.toUpperCase() === m && u.pathname === p;
}

/**
 * The keys of what a plan acts on: `<route path>|<target>` for every click, dblclick and fill. Plans that
 * share a key never run at the same time (KI-13, D-33). The path is the actor's last `goto`, else the first route.
 */
export function conflictKeys(plan: HauntingPlan): string[] {
  const keys = new Set<string>();
  const fallback = plan.routes[0]?.path ?? '/';
  for (const steps of [plan.actors.a, plan.actors.b]) {
    let path = fallback;
    for (const step of steps ?? []) {
      if ('goto' in step) path = step.goto;
      const t = target(step);
      if (t) keys.add(`${path}|${JSON.stringify(t)}`);
    }
  }
  return [...keys];
}

function target(step: Step): object | undefined {
  if ('click' in step) return step.click;
  if ('dblclick' in step) return step.dblclick;
  if ('fill' in step) return step.fill.target;
  return undefined;
}

/** The identity every actor of a plan starts as: the first account among its routes, else `anonymous`. */
export function planIdentity(plan: HauntingPlan): { identity: string } | { error: string } {
  const accounts = [...new Set(plan.routes.map((r) => r.identity).filter((i) => i !== 'anonymous'))];
  if (accounts.length > 1) return { error: `plan uses two accounts (${accounts.join(', ')}); one plan runs as one identity` };
  return { identity: accounts[0] ?? 'anonymous' };
}

/** What a guard report means for the run (D-22, D-33). */
export function blockAction(b: BlockedRequest): 'abort-run' | 'blocked-by-rule' | 'record' {
  if (b.reason === 'leak') return 'abort-run';
  if (b.reason === 'forbidden') return 'blocked-by-rule';
  return 'record';
}
