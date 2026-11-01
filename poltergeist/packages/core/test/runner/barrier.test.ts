import { describe, expect, it } from 'vitest';
import { BarrierSet } from '../../src/runner/barrier.js';

const pending = Symbol('pending');
const peek = <T>(p: Promise<T>) => Promise.race([p, new Promise<typeof pending>((r) => setTimeout(() => r(pending), 5))]);

describe('BarrierSet', () => {
  it('holds the first actor until the second arrives, then releases both', async () => {
    const b = new BarrierSet(['a', 'b']);
    const a = b.arrive('fire', 'a');
    expect(await peek(a)).toBe(pending);
    const second = b.arrive('fire', 'b');
    expect(await a).toBe('released');
    expect(await second).toBe('released');
    expect(b.releases.get('fire')).toBeTypeOf('number');
  });

  it('releases a single actor at once', async () => {
    expect(await new BarrierSet(['a']).arrive('fire', 'a')).toBe('released');
  });

  it('breaks when the other actor leaves first', async () => {
    const b = new BarrierSet(['a', 'b']);
    const a = b.arrive('fire', 'a');
    b.leave('b');
    expect(await a).toBe('broken');
    expect(b.releases.has('fire')).toBe(false);
  });

  it('is broken at once when the other actor already left', async () => {
    const b = new BarrierSet(['a', 'b']);
    b.leave('b');
    expect(await b.arrive('fire', 'a')).toBe('broken');
  });

  it('releases barriers in sequence independently', async () => {
    const b = new BarrierSet(['a', 'b']);
    const [a1, b1] = [b.arrive('one', 'a'), b.arrive('one', 'b')];
    expect([await a1, await b1]).toEqual(['released', 'released']);
    const a2 = b.arrive('two', 'a');
    expect(await peek(a2)).toBe(pending);
    const b2 = b.arrive('two', 'b');
    expect([await a2, await b2]).toEqual(['released', 'released']);
    expect(b.releases.size).toBe(2);
  });
});
