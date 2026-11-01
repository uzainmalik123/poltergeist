import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RenderedReport } from '../../src/report/render.js';
import { ReportJsonSchema } from '../../src/report/schema.js';
import { REPORT_FILES, writeReport } from '../../src/report/write.js';

const rendered = (markdown: string): RenderedReport => ({
  markdown,
  json: {
    version: 1, runId: 'r1', target: 'http://127.0.0.1:4000', model: 'm', reps: 3, startedAt: '2026-11-01T00:00:00.000Z', specFile: 'requirements.md',
    counts: { haunted: 0, flaky: 0, inconclusive: 0, clean: 0, notApplicable: 0, notRun: 0 }, criteria: [], truncated: 0,
  },
});

async function specDir() {
  const dir = await mkdtemp(join(tmpdir(), 'report-spec-'));
  for (const f of ['requirements.md', 'design.md', 'tasks.md']) await writeFile(join(dir, f), `# ${f}\n`);
  return dir;
}

describe('writeReport', () => {
  it('writes exactly the two report files and leaves the spec files untouched (Req 8.3)', async () => {
    const dir = await specDir();
    const before = await Promise.all(['requirements.md', 'design.md', 'tasks.md'].map((f) => stat(join(dir, f))));
    const paths = await writeReport(dir, rendered('# Haunting report\n'));
    expect(paths).toEqual({ markdownPath: join(dir, REPORT_FILES.markdown), jsonPath: join(dir, REPORT_FILES.json) });
    expect((await readdir(dir)).sort()).toEqual(['design.md', 'haunting-report.json', 'haunting-report.md', 'requirements.md', 'tasks.md']);
    const after = await Promise.all(['requirements.md', 'design.md', 'tasks.md'].map((f) => stat(join(dir, f))));
    expect(after.map((s) => s.mtimeMs)).toEqual(before.map((s) => s.mtimeMs));
    for (const f of ['requirements.md', 'design.md', 'tasks.md']) expect(await readFile(join(dir, f), 'utf8')).toBe(`# ${f}\n`);
  });

  it('replaces a longer stale report whole and leaves no temp files (Review Focus 5)', async () => {
    const dir = await specDir();
    await writeFile(join(dir, REPORT_FILES.markdown), 'old\n'.repeat(500));
    await writeReport(dir, rendered('new\n'));
    expect(await readFile(join(dir, REPORT_FILES.markdown), 'utf8')).toBe('new\n');
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('writes JSON that parses with the schema', async () => {
    const dir = await specDir();
    const { jsonPath } = await writeReport(dir, rendered('x\n'));
    const text = await readFile(jsonPath, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(ReportJsonSchema.parse(JSON.parse(text)).runId).toBe('r1');
  });

  it('rejects a missing spec folder and creates nothing', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'report-missing-')), 'nope');
    await expect(writeReport(dir, rendered('x\n'))).rejects.toThrow();
    await expect(stat(dir)).rejects.toThrow();
  });
});
