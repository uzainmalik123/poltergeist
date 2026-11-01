import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PairResult } from '../../src/compiler/compile.js';
import { renderReport } from '../../src/report/render.js';
import { writeReport } from '../../src/report/write.js';
import { runPlans } from '../../src/runner/run.js';
import { guardLaunchOptions } from '../../src/safety/guard.js';
import { parseSpec } from '../../src/spec/read.js';
import { computeVerdicts } from '../../src/verdicts/compute.js';
import { sessionState, startClaimsFixture, type ClaimsFixture } from '../runner/claims-fixture.js';
import { loadFor, plan } from '../runner/run-helpers.js';

// PRD F08 Done-when, fixture-first (D-35). The Kiro and real Candy Swap check is KI-38.
// Set POLTERGEIST_SAMPLE_DIR to keep the generated project for the agent check.
const SAMPLE = process.env.POLTERGEIST_SAMPLE_DIR;

const REQUIREMENTS = `# Requirements Document

## Requirements

### Requirement 3: Claiming candy

**User Story:** As a trader, I want each candy claimed once, so that trades are fair.

#### Acceptance Criteria

1. THE Claims page SHALL load without uncaught exceptions.
2. WHEN two sessions claim the same candy at once, THE System SHALL record only one claim.
`;

let browser: Browser;
let fixture: ClaimsFixture;
let root: string;

beforeAll(async () => {
  fixture = await startClaimsFixture();
  browser = await chromium.launch(guardLaunchOptions({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] }));
  root = SAMPLE ? resolve(SAMPLE) : await mkdtemp(join(tmpdir(), 'f08-done-when-'));
});
afterAll(async () => {
  await browser?.close();
  await fixture?.close();
  if (!SAMPLE && root) await rm(root, { recursive: true, force: true });
});

describe('F08 Done-when (fixture)', () => {
  it('reports the reproduced race as a fix-ready haunted task with real artifact paths', async () => {
    const specDir = join(root, '.kiro', 'specs', 'claims');
    const runDir = join(root, '.poltergeist', 'runs', 'r1');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, 'requirements.md'), REQUIREMENTS);
    const { criteria } = await parseSpec(specDir);
    expect(criteria.map((c) => c.id)).toEqual(['3.1', '3.2']);

    const steps = [{ goto: '/claims' }, { barrier: 'fire' }, { click: { role: 'button' as const, name: 'Claim Sour Skulls' } }, { wait: 500 }];
    const race = plan('3.2', 'doppelganger', { a: steps, b: steps }, [
      { api: { method: 'GET', path: '/api/candies/sour-skulls', jsonPath: '$.claims.length', equals: 1 } },
    ]);
    race.intent = 'Two sessions claim Sour Skulls at the same moment; only one claim should be recorded.';
    const loads = plan('3.1', 'wraith', { a: [{ goto: '/claims' }] }, [{ noUncaughtExceptions: true }]);
    const compiled: PairResult[] = [race, loads].map((p) => ({ status: 'compiled', criterion: p.criterion, persona: p.persona, plan: p, cached: false, attempts: 1 }));

    const startedAt = Date.now();
    const run = await runPlans(browser, loadFor(fixture.origin), [loads, race], {
      sessions: new Map([['default', sessionState(fixture.origin)]]),
      reps: 3,
      frameFps: 0,
      outDir: runDir,
    });
    const verdicts = computeVerdicts(compiled, run);
    const rendered = renderReport({
      specDir, criteria, compiled, verdicts,
      run: { runId: 'r1', runDir, target: fixture.origin, reps: run.reps, model: 'claude-sonnet-5-5', startedAt },
    });
    const { markdownPath } = await writeReport(specDir, rendered);

    const md = await readFile(markdownPath, 'utf8');
    expect(verdicts.criteria.map((c) => [c.criterion, c.verdict])).toEqual([['3.2', 'haunted'], ['3.1', 'clean']]);
    expect(md).toContain('- [ok] 3.1 — ');
    expect(md).toContain('### [!!] 3.2 — WHEN two sessions claim the same candy at once');
    expect(md).toContain('click button "Claim Sour Skulls"');
    expect(md).toContain('**Expected:** GET /api/candies/sour-skulls $.claims.length equals 1');
    expect(md).toMatch(/#### doppelganger — failed [23]\/3 reps/);
    const paths = [...md.matchAll(/^- `(\.\.\/[^`]+)`$/gm)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) await expect(stat(join(specDir, p))).resolves.toBeTruthy();
  }, 120_000);
});
