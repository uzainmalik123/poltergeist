import type { SummonEvent, SummonOptions, SummonResult } from '@poltergeist/core';
import { describe, expect, it } from 'vitest';
import { RunBusyError, RunManager, UnknownRunError } from '../src/runs.js';

function fakeSummon() {
  const calls: SummonOptions[] = [];
  const settle: { resolve?: (r: SummonResult) => void; reject?: (e: unknown) => void } = {};
  const summon = (opts: SummonOptions) => {
    calls.push(opts);
    return new Promise<SummonResult>((resolve, reject) => Object.assign(settle, { resolve, reject }));
  };
  const result = (runId: string, haunted: string[] = []) =>
    ({
      runId, runDir: `/w/.poltergeist/runs/${runId}`, specDir: '/w/s', target: 't', criteria: [{ id: '3.1' }, { id: '3.2' }], compiled: [],
      verdicts: { reps: 1, threshold: 1, pairs: [], counts: {}, criteria: [{ criterion: '3.1', verdict: 'clean', personas: {} }, { criterion: '3.2', verdict: haunted.length ? 'haunted' : 'clean', personas: {} }] },
      haunted, allResetsFailed: false, reportPaths: { markdownPath: '/w/s/haunting-report.md', jsonPath: '/w/s/haunting-report.json' },
    }) as unknown as SummonResult;
  const emit = (e: Record<string, unknown>) => calls.at(-1)!.onEvent!({ t: 0, ...e } as SummonEvent);
  return { summon, calls, settle, result, emit };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('RunManager', () => {
  it('starts a run and long-polls it to the end', async () => {
    const f = fakeSummon();
    const runs = new RunManager({ summon: f.summon, root: '/w' });
    const id = runs.start({ specDir: 's' });
    expect(typeof id).toBe('string');
    expect(f.calls[0]).toMatchObject({ specDir: 's', runId: id });

    f.emit({ type: 'run.started', runId: id, specDir: 's', target: 't', criteria: ['3.1', '3.2'], personas: ['wraith', 'lich'], reps: 3 });
    f.emit({ type: 'plan.compiled', criterion: '3.1', persona: 'wraith', status: 'compiled', cached: false });
    f.emit({ type: 'rep.finished', rep: 1, outcomes: {} });
    const running = await runs.wait(id, 10);
    expect(running).toMatchObject({ runId: id, status: 'running', progress: { phase: 'run', plansDone: 1, plansTotal: 4, repsDone: 1, reps: 3 } });

    const later = runs.wait(id, 60_000);
    f.settle.resolve!(f.result(id, ['3.2']));
    expect(await later).toMatchObject({ status: 'finished', haunted: ['3.2'], reportPath: 's/haunting-report.md' });
    // Still answerable after it settled.
    expect(await runs.wait(id, 0)).toMatchObject({ status: 'finished' });
  });

  it('allows one active run at a time', async () => {
    const f = fakeSummon();
    const runs = new RunManager({ summon: f.summon, root: '/w' });
    const id = runs.start({ specDir: 's' });
    expect(() => runs.start({ specDir: 's' })).toThrow(RunBusyError);
    try {
      runs.start({ specDir: 's' });
    } catch (err) {
      expect((err as RunBusyError).activeRunId).toBe(id);
    }
    f.settle.resolve!(f.result(id));
    await runs.wait(id, 1000);
    expect(() => runs.start({ specDir: 's' })).not.toThrow();
  });

  it('reports a run that fails in the background, then allows the next', async () => {
    const f = fakeSummon();
    const runs = new RunManager({ summon: f.summon, root: '/w' });
    const id = runs.start({ specDir: 's' });
    f.settle.reject!(new Error('ANTHROPIC_API_KEY is not set'));
    expect(await runs.wait(id, 1000)).toMatchObject({ status: 'failed', error: expect.stringContaining('ANTHROPIC_API_KEY') });
    expect(() => runs.start({ specDir: 's' })).not.toThrow();
  });

  it('rejects run ids it never started', async () => {
    const runs = new RunManager({ summon: fakeSummon().summon, root: '/w' });
    await expect(runs.wait('nope', 0)).rejects.toThrow(UnknownRunError);
  });

  it('aborts the active run', async () => {
    const f = fakeSummon();
    const runs = new RunManager({ summon: f.summon, root: '/w' });
    runs.start({ specDir: 's' });
    const done = runs.abortAll();
    await tick();
    expect(f.calls[0]!.signal!.aborted).toBe(true);
    f.settle.reject!(new DOMException('aborted', 'AbortError'));
    await done;
  });

  it('forgets the oldest settled runs past 20', async () => {
    const f = fakeSummon();
    const runs = new RunManager({ summon: f.summon, root: '/w' });
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const id = runs.start({ specDir: 's' });
      ids.push(id);
      f.settle.resolve!(f.result(id));
      await runs.wait(id, 1000);
    }
    await expect(runs.wait(ids[0]!, 0)).rejects.toThrow(UnknownRunError);
    await expect(runs.wait(ids[20]!, 0)).resolves.toMatchObject({ status: 'finished' });
  });
});
