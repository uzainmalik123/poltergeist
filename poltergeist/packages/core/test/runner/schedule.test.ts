import { describe, expect, it } from 'vitest';
import { runScheduled, type Job } from '../../src/runner/schedule.js';

type Deferred = { promise: Promise<string>; resolve(v: string): void; reject(e: unknown): void };
const deferred = (): Deferred => {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Jobs whose completion the test controls; `started` records the start order. */
function harness(specs: { keys?: string[]; slots?: number }[]) {
  const started: number[] = [];
  const ds = specs.map(() => deferred());
  const jobs: Job<string>[] = specs.map((s, i) => ({
    keys: s.keys ?? [],
    slots: s.slots ?? 1,
    run: () => {
      started.push(i);
      return ds[i]!.promise;
    },
  }));
  return { started, ds, jobs };
}

describe('runScheduled', () => {
  it('runs at most capacity slots at once', async () => {
    const h = harness([{}, {}, {}]);
    const done = runScheduled(h.jobs, 2);
    await tick();
    expect(h.started).toEqual([0, 1]);
    h.ds[0]!.resolve('a');
    await tick();
    expect(h.started).toEqual([0, 1, 2]);
    h.ds[1]!.resolve('b');
    h.ds[2]!.resolve('c');
    expect((await done).map((r) => r.status === 'fulfilled' && r.value)).toEqual(['a', 'b', 'c']);
  });

  it('never overlaps jobs that share a key', async () => {
    const h = harness([{ keys: ['k'] }, { keys: ['k', 'x'] }]);
    const done = runScheduled(h.jobs, 12);
    await tick();
    expect(h.started).toEqual([0]);
    h.ds[0]!.resolve('a');
    await tick();
    expect(h.started).toEqual([0, 1]);
    h.ds[1]!.resolve('b');
    await done;
  });

  it('lets a later free job pass a blocked one', async () => {
    const h = harness([{ keys: ['k'] }, { keys: ['k'] }, { keys: ['z'] }]);
    const done = runScheduled(h.jobs, 12);
    await tick();
    expect(h.started).toEqual([0, 2]);
    h.ds[0]!.resolve('a');
    h.ds[2]!.resolve('c');
    await tick();
    expect(h.started).toEqual([0, 2, 1]);
    h.ds[1]!.resolve('b');
    await done;
  });

  it('counts slots and clamps a job larger than capacity', async () => {
    const h = harness([{ slots: 2 }, { slots: 1 }]);
    const done = runScheduled(h.jobs, 2);
    await tick();
    expect(h.started).toEqual([0]);
    h.ds[0]!.resolve('a');
    await tick();
    expect(h.started).toEqual([0, 1]);
    h.ds[1]!.resolve('b');
    await done;

    const one = harness([{ slots: 2 }]);
    const d1 = runScheduled(one.jobs, 1);
    await tick();
    expect(one.started).toEqual([0]);
    one.ds[0]!.resolve('x');
    await d1;
  });

  it('reports rejections and synchronous throws in input order', async () => {
    const jobs: Job<string>[] = [
      { keys: [], slots: 1, run: () => Promise.reject(new Error('nope')) },
      { keys: [], slots: 1, run: () => { throw new Error('sync'); } },
      { keys: [], slots: 1, run: () => Promise.resolve('ok') },
    ];
    const r = await runScheduled(jobs, 1);
    expect(r.map((x) => x.status)).toEqual(['rejected', 'rejected', 'fulfilled']);
  });

  it('stops starting jobs once aborted, and lets running ones finish', async () => {
    const h = harness([{}, {}, {}]);
    const ac = new AbortController();
    const done = runScheduled(h.jobs, 1, ac.signal);
    await tick();
    ac.abort(new Error('stop'));
    h.ds[0]!.resolve('a');
    const r = await done;
    expect(h.started).toEqual([0]);
    expect(r[0]).toEqual({ status: 'fulfilled', value: 'a' });
    expect(r[1]).toMatchObject({ status: 'rejected', reason: new Error('stop') });
    expect(r[2]?.status).toBe('rejected');
  });

  it('returns at once for no jobs, and rejects a bad capacity', async () => {
    expect(await runScheduled([], 3)).toEqual([]);
    expect(() => runScheduled([], 0)).toThrow(RangeError);
  });
});
