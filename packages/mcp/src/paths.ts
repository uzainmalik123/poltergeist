import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** A path the agent passed resolves outside the server's root (D-38). */
export class PathError extends Error {
  override name = 'PathError';
}

const inside = (root: string, p: string) => {
  const rel = relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** `p` resolved against `root`; throws `PathError` unless it is `root` or inside it. */
export function resolveInside(root: string, p: string): string {
  const abs = resolve(root, p);
  if (!inside(resolve(root), abs)) throw new PathError(`${p} is outside the workspace root ${root}`);
  return abs;
}

/** The nearest `poltergeist.config.json` from `specDir` up to `root` inclusive. */
export function findConfig(specDir: string, root: string): string | undefined {
  const top = resolve(root);
  let dir = resolve(specDir);
  while (inside(top, dir)) {
    const candidate = join(dir, 'poltergeist.config.json');
    if (existsSync(candidate)) return candidate;
    if (dir === top) break;
    dir = dirname(dir);
  }
  return undefined;
}
