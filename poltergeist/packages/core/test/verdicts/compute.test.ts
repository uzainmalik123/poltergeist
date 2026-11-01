import { describe, expect, it } from 'vitest';
import type { HauntingPlan } from '../../src/compiler/dsl.js';
import type { PairResult } from '../../src/compiler/compile.js';
import type { PersonaId } from '../../src/personas/registry.js';
import type { AssertionResult, PairRepResult } from '../../src/runner/types.js';
import { computeVerdicts, rollUp } from '../../src/verdicts/compute.js';

const plan = (criterion: string, persona: PersonaId): HauntingPlan => ({
  criterion,
  persona,
  intent: 'x',
  routes: [{ path: '/', identity: 'anonymous' }],
  actors: { a: [{ goto: '/' }] },
  assert: [{ noConsoleErrors: true }],
});
const compiled = (criterion: string, persona: PersonaId): PairResult => ({
  status: 'compiled',
  criterion,
  persona,
  plan: plan(criterion, persona),
  cached: false,
  attempts: 1,
});
const fail: AssertionResult = { index: 0, type: 'noConsoleErrors', ok: false, detail: '1 console error(s): boom', failure: 'app' };
const pass: AssertionResult = { index: 0, type: 'noConsoleErrors', ok: true, detail: 'no console errors' };
const rep = (criterion: string, persona: PersonaId, k: number, assertions: AssertionResult[] = [pass]): PairRepResult => ({
  criterion,
  persona,
  rep: k,
  outcome: 'completed',
  steps: [],
  assertions,
  blocked: [],
  artifacts: [],
  notes: [],
  startedAt: 0,
  endedAt: 0,
});

describe('rollUp', () => {
  it.each([
    [[], 'notApplicable'],
    [['notApplicable'], 'notApplicable'],
    [['clean', 'notApplicable'], 'clean'],
    [['clean', 'uncompilable'], 'inconclusive'],
    [['clean', 'flaky', 'inconclusive'], 'flaky'],
    [['flaky', 'haunted'], 'haunted'],
  ] as const)('%j → %s', (input, expected) => {
    expect(rollUp(input)).toBe(expected);
  });
});

describe('computeVerdicts', () => {
  it('joins compile statuses with run results and rolls up per criterion', () => {
    const pairs: PairResult[] = [
      compiled('1.1', 'wraith'),
      { status: 'notApplicable', criterion: '1.1', persona: 'banshee', reason: 'no input fields', routes: [], cached: false, attempts: 1 },
      { status: 'uncompilable', criterion: '1.2', persona: 'wraith', reason: 'no route matched', errors: ['no route'], attempts: 0 },
      compiled('2.1', 'doppelganger'),
    ];
    const results = [1, 2, 3].flatMap((k) => [rep('1.1', 'wraith', k, [fail]), rep('2.1', 'doppelganger', k)]);
    const v = computeVerdicts(pairs, { reps: 3, results });
    expect(v.threshold).toBe(2);
    expect(v.reps).toBe(3);
    expect(v.pairs.map((p) => [p.criterion, p.persona, p.verdict])).toEqual([
      ['1.1', 'wraith', 'haunted'],
      ['1.1', 'banshee', 'notApplicable'],
      ['1.2', 'wraith', 'uncompilable'],
      ['2.1', 'doppelganger', 'clean'],
    ]);
    expect(v.pairs[1]?.reason).toBe('no input fields');
    expect(v.pairs[2]?.notes).toEqual(['no route']);
    expect(v.criteria).toEqual([
      { criterion: '1.1', verdict: 'haunted', personas: { wraith: 'haunted', banshee: 'notApplicable' } },
      { criterion: '1.2', verdict: 'inconclusive', personas: { wraith: 'uncompilable' } },
      { criterion: '2.1', verdict: 'clean', personas: { doppelganger: 'clean' } },
    ]);
    expect(v.counts).toEqual({ haunted: 1, flaky: 0, inconclusive: 0, clean: 1, notApplicable: 1, uncompilable: 1 });
  });

  it('treats missing reps as inconclusive, not clean', () => {
    const v = computeVerdicts([compiled('1.1', 'wraith')], { reps: 3, results: [rep('1.1', 'wraith', 1)] });
    expect(v.pairs[0]?.verdict).toBe('inconclusive');
    expect(v.pairs[0]?.outcomes.missing).toBe(2);
  });

  it('marks a compiled pair that never ran as inconclusive', () => {
    expect(computeVerdicts([compiled('1.1', 'wraith')], { reps: 3, results: [] }).pairs[0]?.verdict).toBe('inconclusive');
  });

  it('throws on duplicate rep results', () => {
    expect(() =>
      computeVerdicts([compiled('3.1', 'wraith')], { reps: 3, results: [rep('3.1', 'wraith', 2), rep('3.1', 'wraith', 2)] }),
    ).toThrow(new TypeError('duplicate result for 3.1/wraith rep 2'));
  });

  it('throws on a result with no compiled plan', () => {
    expect(() => computeVerdicts([], { reps: 3, results: [rep('3.1', 'wraith', 1)] })).toThrow(
      new TypeError('run result for 3.1/wraith has no compiled plan'),
    );
  });

  it.each([0, 4])('throws on rep %i outside 1…reps', (k) => {
    expect(() => computeVerdicts([compiled('3.1', 'wraith')], { reps: 3, results: [rep('3.1', 'wraith', k)] })).toThrow(TypeError);
  });

  it.each([0, -1, 1.5])('throws on reps %s instead of calling everything clean', (reps) => {
    expect(() => computeVerdicts([compiled('3.1', 'wraith')], { reps, results: [] })).toThrow(TypeError);
  });

  it('throws on a duplicate input pair', () => {
    expect(() => computeVerdicts([compiled('3.1', 'wraith'), compiled('3.1', 'wraith')], { reps: 3, results: [] })).toThrow(TypeError);
  });
});
