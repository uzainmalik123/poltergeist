import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** A path the agent passed resolves outside the server's root (D-38). */
export class PathError extends Error {
  override name = 'PathError';
}

const inside = (root: string, p: string) => {
  const rel = relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** `p` with symlinks resolved in its longest existing prefix; the rest (not created yet) is kept as is. */
function realish(p: string): string {
  const rest: string[] = [];
  let dir = p;
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return p;
    rest.unshift(basename(dir));
    dir = parent;
  }
  return join(realpathSync(dir), ...rest);
}

/**
 * `p` resolved against `root`; throws `PathError` unless it is `root` or inside it, both as
 * written and after following symlinks, so a link can't carry reads or report writes outside.
 */
export function resolveInside(root: string, p: string): string {
  const abs = resolve(root, p);
  const ok = inside(resolve(root), abs) && inside(realish(resolve(root)), realish(abs));
  if (!ok) throw new PathError(`${p} is outside the workspace root ${root}`);
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
