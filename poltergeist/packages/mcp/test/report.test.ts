import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReportJson } from '@poltergeist/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_TEXT } from '../src/format.js';
import { NoReportError, readReport } from '../src/report.js';

// Shaped like F08's renderer output (D-35); the fixture Done-when reads a real one.
const markdown = (haunted = '') => `# Haunting report

run r1 · target http://127.0.0.1:4000 · 3 reps

**1 haunted** [!!] · 0 flaky [~~] · 0 inconclusive [??] · 1 clean [ok] · 0 n/a [--] · 0 not run [  ]

## Board

- [!!] 3.2 — Only one claim is recorded
- [ok] 3.1 — The claims page loads

## Haunted

### [!!] 3.2 — Only one claim is recorded

#### doppelganger — failed 3 of 3 reps
${haunted}
- expected one claim, got 2

### [!!] 3b.1 — Another
`;

const pair = (persona: 'wraith' | 'doppelganger', verdict: 'clean' | 'haunted') => ({
  persona, verdict, reason: `${persona} ${verdict} reason`, notes: [], reps: 3, repsRun: 3, threshold: 2, expected: [],
  failing: verdict === 'haunted' ? [{ index: 0, type: 'api', expected: 'one claim', failures: 3, lastDetail: 'got 2 claims' }] : [],
  failedReps: [], outcomes: { completed: 3, timeout: 0, planError: 0, systemError: 0, voided: 0, missing: 0 }, artifacts: [],
});

const json: ReportJson = {
  version: 1, runId: 'r1', target: 'http://127.0.0.1:4000', model: 'm', reps: 3, startedAt: '2026-11-01T00:00:00.000Z',
  specFile: 'requirements.md', counts: { haunted: 2, flaky: 0, inconclusive: 0, clean: 1, notApplicable: 0, notRun: 0 }, truncated: 0,
  criteria: [
    { id: '3.1', requirement: 'Claims', text: 'The claims page loads', line: 5, verdict: 'clean', pairs: [pair('wraith', 'clean')] },
    { id: '3.2', requirement: 'Claims', text: 'Only one claim is recorded', line: 6, verdict: 'haunted', pairs: [pair('doppelganger', 'haunted')] },
    { id: '3b.1', requirement: 'Other', text: 'Another', line: 9, verdict: 'haunted', pairs: [] },
  ],
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mcp-report-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function write(md = markdown()) {
  await writeFile(join(dir, 'haunting-report.md'), md);
  await writeFile(join(dir, 'haunting-report.json'), JSON.stringify(json));
}

describe('readReport', () => {
  it('without a criterion returns the header and board only', async () => {
    await write();
    const out = await readReport(dir);
    expect(out).toContain('## Board');
    expect(out).toContain('[!!] 3.2');
    expect(out).not.toContain('## Haunted');
    expect(out).toContain('get_haunting_report');
  });

  it('with a criterion returns just its section', async () => {
    await write();
    const out = await readReport(dir, '3.2');
    expect(out.startsWith('### [!!] 3.2 — ')).toBe(true);
    expect(out).toContain('doppelganger');
    expect(out).not.toContain('3b.1');
  });

  it('does not treat the dot in an id as a wildcard', async () => {
    await write(markdown().replace('### [!!] 3b.1', '### [!!] 3x1'));
    const out = await readReport(dir, '3b.1');
    expect(out).toContain('3b.1 — haunted');
  });

  it('falls back to the JSON for a criterion without a markdown section', async () => {
    await write();
    const out = await readReport(dir, '3.1');
    expect(out).toContain('3.1 — clean');
    expect(out).toContain('The claims page loads');
    expect(out).toContain('wraith: clean — wraith clean reason');
  });

  it('includes the first failing detail in the fallback', async () => {
    await write(markdown().replace(/### \[!!\] 3\.2[\s\S]*?(?=### )/, ''));
    expect(await readReport(dir, '3.2')).toContain('got 2 claims');
  });

  it('rejects an unknown criterion, naming the known ones', async () => {
    await write();
    await expect(readReport(dir, '9.9')).rejects.toThrow(/9\.9.*3\.1, 3\.2, 3b\.1/);
  });

  it('says to summon first when there is no report', async () => {
    await expect(readReport(dir)).rejects.toThrow(NoReportError);
    await expect(readReport(dir)).rejects.toThrow(/summon_ghosts/);
  });

  it('caps a giant section', async () => {
    await write(markdown('- noise\n'.repeat(2000)));
    expect((await readReport(dir, '3.2')).length).toBeLessThanOrEqual(MAX_TEXT);
  });
});
