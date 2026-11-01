import { randomBytes } from 'node:crypto';
import { rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenderedReport } from './render.js';

/** The only files Poltergeist ever writes into a spec folder (Req 8.1, 8.3, D-14). */
export const REPORT_FILES = Object.freeze({ markdown: 'haunting-report.md', json: 'haunting-report.json' } as const);

/**
 * Writes both report files into an existing spec folder, each through a temp file and a rename,
 * so every run replaces them whole. Never creates the folder: it belongs to the user.
 */
export async function writeReport(specDir: string, rendered: RenderedReport): Promise<{ markdownPath: string; jsonPath: string }> {
  if (!(await stat(specDir)).isDirectory()) throw new Error(`not a directory: ${specDir}`);
  const markdownPath = join(specDir, REPORT_FILES.markdown);
  const jsonPath = join(specDir, REPORT_FILES.json);
  await atomicWrite(jsonPath, JSON.stringify(rendered.json, null, 2) + '\n');
  await atomicWrite(markdownPath, rendered.markdown);
  return { markdownPath, jsonPath };
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, content);
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
