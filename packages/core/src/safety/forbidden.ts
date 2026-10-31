import type { ForbiddenRule } from '../config/schema.js';

/** Returns the first rule a request matches, or null. */
export type ForbiddenMatcher = (method: string, url: string) => ForbiddenRule | null;

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

function decodedPath(url: string): string {
  const raw = new URL(url).pathname;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Compiles `forbidden` rules once (D-17, D-29). Method is `*` or exact (any case); path is a glob where
 * `*` crosses `/`, matched case-sensitively against the percent-decoded pathname; the query is ignored.
 */
export function compileForbidden(rules: readonly ForbiddenRule[]): ForbiddenMatcher {
  const compiled = rules.map((rule) => ({ rule, method: rule.method.toUpperCase(), path: globToRegExp(rule.path) }));
  return (method, url) => {
    if (compiled.length === 0) return null;
    const m = method.toUpperCase();
    const path = decodedPath(url);
    for (const c of compiled) {
      if ((c.method === '*' || c.method === m) && c.path.test(path)) return c.rule;
    }
    return null;
  };
}
