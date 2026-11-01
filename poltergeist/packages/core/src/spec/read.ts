import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SpecNotFoundError } from './errors.js';
import { parseRequirements } from './parse.js';
import type { ParsedSpec } from './types.js';

/** Read and parse `<specDir>/requirements.md` (Requirement 1). Throws `SpecNotFoundError` if it can't be read. */
export async function parseSpec(specDir: string): Promise<ParsedSpec> {
  const path = join(specDir, 'requirements.md');
  let markdown: string;
  try {
    markdown = await readFile(path, 'utf8');
  } catch (cause) {
    throw new SpecNotFoundError(path, { cause });
  }
  return parseRequirements(markdown);
}
