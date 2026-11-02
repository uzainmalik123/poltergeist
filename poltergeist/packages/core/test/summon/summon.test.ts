import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardLaunchOptions } from '../../src/safety/guard.js';
import { UsageError } from '../../src/summon/errors.js';
import { summon } from '../../src/summon/summon.js';
import type { SummonEvent, SummonOptions } from '../../src/summon/types.js';
import { makeClaimsProject, type ClaimsProject } from './project-fixture.js';

let project: ClaimsProject;
beforeAll(async () => {
  project = await makeClaimsProject();
});
afterAll(async () => project?.close());

/** A real guarded launcher that records whether it ran and whether its browser was closed. */
function spyLauncher() {
  const spy = { launched: 0, closed: 0, launch: async (): Promise<Browser> => {
    spy.launched++;
    const b = await chromium.launch(guardLaunchOptions());
    b.on('disconnected', () => spy.closed++);
    return b;
  } };
  return spy;
}

const opts = (over: Partial<SummonOptions> = {}): SummonOptions => ({
  specDir: project.specDir,
  configPath: project.configPath,
  env: project.env,
  personas: ['wraith', 'doppelganger'],
  runOptions: { frameFps: 0 },
  llm: project.llm().client,
  ...over,
});

const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8'));

describe('summon', () => {
  it('runs the whole haunting and writes the run folder and the report', async () => {
    const events: SummonEvent[] = [];
    const spy = spyLauncher();
    const r = await summon(opts({ launch: spy.launch, onEvent: (e) => events.push(e) }));
    expect(r.haunted).toEqual(['3.2']);
    expect(r.allResetsFailed).toBe(false);
    expect(r.verdicts.criteria.map((c) => [c.criterion, c.verdict])).toEqual([['3.1', 'clean'], ['3.2', 'haunted']]);
    expect(existsSync(join(project.specDir, 'haunting-report.md'))).toBe(true);
    expect(r.reportPaths.markdownPath).toBe(join(project.specDir, 'haunting-report.md'));
    expect(r.runDir).toBe(join(project.root, '.poltergeist', 'runs', r.runId));
    expect(spy.closed).toBe(1);

    const run = await readJson(join(r.runDir, 'run.json'));
    expect(run.specHash).toMatch(/^[0-9a-f]{64}$/);
    expect(run.config.accounts.default.password).toBe('env:GHOST_PASS');
    expect(run.scoutHash).toEqual(expect.any(String));
    expect(run.finishedAt).toEqual(expect.any(Number));
    expect((await readJson(join(r.runDir, 'verdicts.json'))).criteria).toHaveLength(2);

    const ndjson = (await readFile(join(r.runDir, 'events.ndjson'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l).type as string);
    const order = ['run.started', 'scout.route', 'plan.compiled', 'rep.started', 'verdict.pair', 'verdict.criterion', 'run.finished'];
    const firsts = order.map((t) => ndjson.indexOf(t));
    expect(firsts.every((i) => i >= 0)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    expect(ndjson.at(-1)).toBe('run.finished');
    for (const t of order) expect(events.some((e) => e.type === t)).toBe(true);
    expect(events[0]).toMatchObject({ type: 'run.started', runDir: r.runDir });
  }, 120_000);

  it('rejects an unknown --only id before launching or compiling', async () => {
    const fake = project.llm();
    const spy = spyLauncher();
    await expect(summon(opts({ only: ['9.9'], llm: fake.client, launch: spy.launch }))).rejects.toThrow(UsageError);
    await expect(summon(opts({ only: ['9.9'], llm: fake.client, launch: spy.launch }))).rejects.toThrow(/unknown criterion id: 9\.9 \(known: 3\.1, 3\.2\)/);
    expect(fake.calls).toHaveLength(0);
    expect(spy.launched).toBe(0);
  });

  it('rejects an unknown persona', async () => {
    await expect(summon(opts({ personas: ['ghost'] }))).rejects.toThrow(/unknown persona: ghost \(known: wraith, banshee, doppelganger\)/);
  });

  it('rejects reps outside 1–10', async () => {
    await expect(summon(opts({ reps: 11 }))).rejects.toThrow(UsageError);
  });

  it('dedupes personas instead of failing', async () => {
    const r = await summon(opts({ only: ['3.1'], personas: ['wraith', 'wraith'], reps: 1 }));
    expect(r.compiled).toHaveLength(1);
  }, 60_000);

  it('rejects a spec with no criteria', async () => {
    const empty = await makeClaimsProject();
    try {
      await writeFile(join(empty.specDir, 'requirements.md'), '# Requirements Document\n');
      await expect(summon(opts({ specDir: empty.specDir }))).rejects.toThrow(/no acceptance criteria to haunt/);
    } finally {
      await empty.close();
    }
  });

  it('flags a run where every reset failed, and still writes the report', async () => {
    const broken = await makeClaimsProject({ resetCommand: 'node -e "process.exit(3)"' });
    try {
      const r = await summon(opts({ specDir: broken.specDir, configPath: broken.configPath, env: broken.env, llm: broken.llm().client, only: ['3.1'], reps: 1 }));
      expect(r.allResetsFailed).toBe(true);
      expect(r.resetError).toMatch(/reset failed/);
      expect(existsSync(join(broken.specDir, 'haunting-report.md'))).toBe(true);
    } finally {
      await broken.close();
    }
  }, 60_000);

  it('stops on abort without writing a report and closes the browser', async () => {
    const aborted = await makeClaimsProject();
    try {
      const spy = spyLauncher();
      const ac = new AbortController();
      const p = summon(opts({ specDir: aborted.specDir, configPath: aborted.configPath, env: aborted.env, llm: aborted.llm().client, launch: spy.launch, signal: ac.signal,
        onEvent: (e) => { if (e.type === 'scout.route') ac.abort(new DOMException('aborted', 'AbortError')); } }));
      await expect(p).rejects.toThrow();
      expect(existsSync(join(aborted.specDir, 'haunting-report.md'))).toBe(false);
      expect(spy.launched).toBe(1);
      expect(spy.closed).toBe(1);
    } finally {
      await aborted.close();
    }
  }, 60_000);

  it('reuses cached plans on the next run, and recompiles on request', async () => {
    const cached = project.llm();
    await summon(opts({ llm: cached.client, only: ['3.1'], reps: 1 }));
    expect(cached.calls).toHaveLength(0);
    const fresh = project.llm();
    await summon(opts({ llm: fresh.client, only: ['3.1'], reps: 1, recompile: true }));
    expect(fresh.calls.length).toBeGreaterThan(0);
  }, 60_000);
});
