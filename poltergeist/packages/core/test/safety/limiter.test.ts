import { describe, expect, it } from 'vitest';
import { createLimiter } from '../../src/safety/limiter.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createLimiter', () => {
  it('never runs more than n tasks at once, in FIFO order', async () => {
    const limit = createLimiter(2);
    const gates = Array.from({ length: 5 }, deferred);
    const started: number[] = [];
    let maxActive = 0;
    const runs = gates.map((g, i) =>
      limit(async () => {
        started.push(i);
        maxActive = Math.max(maxActive, limit.active);
        await g.promise;
        return i;
      }),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(limit.pending).toBe(3);
    for (const g of gates) g.resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3, 4]);
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(2);
    expect(limit.active).toBe(0);
  });

  it('turns a synchronous throw into a rejection and frees the slot', async () => {
    const limit = createLimiter(1);
    const bad = limit(() => {
      throw new Error('boom');
    });
    const good = limit(() => 'ok');
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe('ok');
  });

  it.each([0, 1.5, -1, Number.NaN])('rejects n = %s', (n) => {
    expect(() => createLimiter(n)).toThrow(RangeError);
  });
});
