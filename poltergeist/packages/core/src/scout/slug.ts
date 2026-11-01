import { createHash } from 'node:crypto';

function baseSlug(path: string): string {
  const trimmed = path.replace(/^\//, '').replace(/\/+$/, '');
  if (trimmed === '') return 'index';
  return trimmed.replaceAll('/', '__').replace(/[^A-Za-z0-9_-]/g, '_');
}

/** File slugs for route paths: `/` → `index`, `/trade/new` → `trade__new`. Colliding slugs get a path-hash suffix (D-30). */
export function slugsFor(paths: readonly string[]): Map<string, string> {
  const bases = new Map(paths.map((p) => [p, baseSlug(p)]));
  const uses = new Map<string, number>();
  for (const slug of bases.values()) uses.set(slug, (uses.get(slug) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const [path, slug] of bases) {
    const suffix = createHash('sha256').update(path).digest('hex').slice(0, 6);
    out.set(path, (uses.get(slug) ?? 0) > 1 ? `${slug}-${suffix}` : slug);
  }
  return out;
}
