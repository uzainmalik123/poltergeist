import { describe, expect, it } from 'vitest';
import type { AssertionResult, PairRepResult } from '../../src/runner/types.js';
import type { BlockedRequest } from '../../src/safety/guard.js';
import { decidePair } from '../../src/verdicts/pair.js';
import { threshold } from '../../src/verdicts/types.js';

const pass = (index = 0): AssertionResult => ({ index, type: 'textVisible', ok: true, detail: '"Claimed" is visible' });
const fail = (index = 0, failure: AssertionResult['failure'] | null = 'app'): AssertionResult => ({
  index,
  type: 'textVisible',
  ok: false,
  detail: `assertion ${index} failed`,
  ...(failure ? { failure } : {}),
});
const block = (reason: BlockedRequest['reason']): BlockedRequest => ({
  url: 'http://127.0.0.1:4000/api/x',
  host: '127.0.0.1',
  method: 'DELETE',
  resourceType: 'fetch',
  reason,
});

function rep(k: number, over: Partial<PairRepResult> = {}): PairRepResult {
  return {
    criterion: '1.1',
    persona: 'wraith',
    rep: k,
    outcome: 'completed',
    steps: [],
    assertions: [pass()],
    blocked: [],
    artifacts: [],
    notes: [],
    startedAt: 0,
    endedAt: 0,
    ...over,
  };
}

const decide = (results: PairRepResult[], reps = 3) => decidePair('1.1', 'wraith', reps, results);

describe('threshold', () => {
  it('is ⌈2N/3⌉', () => {
    expect([1, 2, 3, 4, 5, 6].map(threshold)).toEqual([1, 2, 2, 3, 4, 4]);
  });
});

describe('decidePair', () => {
  it('is haunted when the same assertion fails in ⌈2N/3⌉ reps', () => {
    const v = decide([rep(1, { assertions: [fail()] }), rep(2, { assertions: [fail()] }), rep(3)]);
    expect(v.verdict).toBe('haunted');
    expect(v.failedReps).toEqual([1, 2]);
    expect(v.failingAssertion?.index).toBe(0);
    expect(v.reason.startsWith('assertion 0 (textVisible) failed in 2 of 3 reps:')).toBe(true);
    expect(v.threshold).toBe(2);
    expect(v.reps).toBe(3);
  });

  it('is flaky when an assertion fails once', () => {
    const v = decide([rep(1, { assertions: [fail()] }), rep(2), rep(3)]);
    expect(v.verdict).toBe('flaky');
    expect(v.reason).toBe('assertion 0 (textVisible) failed in 1 of 3 reps (needs 2 to reproduce); 3 of 3 reps completed');
  });

  it('is flaky when one app failure sits beside system errors', () => {
    const v = decide([rep(1, { assertions: [fail()] }), rep(2, { outcome: 'systemError' }), rep(3, { outcome: 'systemError' })]);
    expect(v.verdict).toBe('flaky');
    expect(v.reason.endsWith('1 of 3 reps completed')).toBe(true);
  });

  it("doesn't add up different assertions failing in different reps", () => {
    const v = decide([
      rep(1, { assertions: [fail(0), pass(1)] }),
      rep(2, { assertions: [pass(0), fail(1)] }),
      rep(3, { assertions: [pass(0), pass(1)] }),
    ]);
    expect(v.verdict).toBe('flaky');
    expect(v.assertions.map((a) => [a.index, a.failures])).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('is clean when every rep passes', () => {
    const v = decide([rep(1), rep(2), rep(3)]);
    expect(v.verdict).toBe('clean');
    expect(v.reason).toBe('all assertions passed in 3 of 3 reps');
    expect(v.failingAssertion).toBeUndefined();
  });

  it('is clean with ⌈2N/3⌉ clean reps beside a plan error', () => {
    expect(decide([rep(1), rep(2), rep(3, { outcome: 'planError' })]).verdict).toBe('clean');
  });

  it('is inconclusive with too few clean reps', () => {
    const v = decide([rep(1), rep(2, { outcome: 'timeout' }), rep(3, { outcome: 'timeout' })]);
    expect(v.verdict).toBe('inconclusive');
    expect(v.reason).toBe('only 1 of 3 reps completed cleanly (needs 2); 2 timeout');
  });

  it.each([['plan'], ['blocked'], [null]] as const)('never counts a %s assertion failure as an app bug', (failure) => {
    const v = decide([1, 2, 3].map((k) => rep(k, { assertions: [fail(0, failure)] })));
    expect(v.verdict).toBe('inconclusive');
    expect(v.assertions).toEqual([]);
  });

  it('voids a rep whose request a forbidden rule blocked', () => {
    const v = decide([1, 2, 3].map((k) => rep(k, { assertions: [fail()], blocked: [block('forbidden')] })));
    expect(v.verdict).toBe('inconclusive');
    expect(v.outcomes.voided).toBe(3);
    expect(v.notes).toContain("rep 1: a forbidden rule blocked a request; its assertions don't count");
  });

  it('voids a rep with a blocked-by-rule step', () => {
    const step = { actor: 'a' as const, index: 1, type: 'click' as const, outcome: 'blocked-by-rule' as const, startedAt: 0, durationMs: 1 };
    const v = decide([1, 2, 3].map((k) => rep(k, { assertions: [fail()], steps: [step] })));
    expect(v.verdict).toBe('inconclusive');
    expect(v.outcomes.voided).toBe(3);
  });

  it('only notes host and redirect blocks', () => {
    const v = decide([
      rep(1, { assertions: [fail()], blocked: [block('host')] }),
      rep(2, { assertions: [fail()], blocked: [block('redirect')] }),
      rep(3),
    ]);
    expect(v.verdict).toBe('haunted');
  });

  it('is haunted with two app failures and a system error', () => {
    expect(decide([rep(1, { assertions: [fail()] }), rep(2, { assertions: [fail()] }), rep(3, { outcome: 'systemError' })]).verdict).toBe(
      'haunted',
    );
  });

  it('follows the formula at N = 1', () => {
    expect(decide([rep(1, { assertions: [fail()] })], 1).verdict).toBe('haunted');
    expect(decide([rep(1)], 1).verdict).toBe('clean');
  });

  it('counts reps with no result as missing', () => {
    const v = decide([]);
    expect(v.verdict).toBe('inconclusive');
    expect(v.outcomes.missing).toBe(3);
    expect(v.reason).toBe('only 0 of 3 reps completed cleanly (needs 2); 3 missing');
  });

  it('keeps evidence from failed reps only, in rep order, and prefixes notes', () => {
    const v = decide([
      rep(3, { assertions: [fail()], artifacts: ['artifacts/1.1__wraith__rep3/screenshot-a.png'] }),
      rep(1, { assertions: [fail()], artifacts: ['artifacts/1.1__wraith__rep1/screenshot-a.png'], notes: ['trace dropped'] }),
      rep(2, { outcome: 'timeout', error: 'plan exceeded 60000 ms', artifacts: ['artifacts/1.1__wraith__rep2/trace-a.zip'] }),
    ]);
    expect(v.evidence).toEqual(['artifacts/1.1__wraith__rep1/screenshot-a.png', 'artifacts/1.1__wraith__rep3/screenshot-a.png']);
    expect(v.notes).toEqual(['rep 1: trace dropped', 'rep 2: plan exceeded 60000 ms']);
    expect(v.failingAssertion?.lastDetail).toBe('assertion 0 failed');
  });

  it('counts a completed rep with no assertions as clean', () => {
    expect(decide([1, 2, 3].map((k) => rep(k, { assertions: [] }))).verdict).toBe('clean');
  });
});
