import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PairResult } from '../../src/compiler/compile.js';
import type { AssertionResult, PairRepResult, RepOutcome } from '../../src/runner/types.js';
import { computeVerdicts } from '../../src/verdicts/compute.js';
import type { PairVerdict } from '../../src/verdicts/types.js';

const pair: PairResult = {
  status: 'compiled',
  criterion: '1.1',
  persona: 'wraith',
  plan: { criterion: '1.1', persona: 'wraith', intent: 'x', routes: [{ path: '/', identity: 'anonymous' }], actors: { a: [] }, assert: [] },
  cached: false,
  attempts: 1,
};

const assertion = (index: number) =>
  fc.oneof(
    fc.constant<AssertionResult>({ index, type: 'textVisible', ok: true, detail: 'ok' }),
    fc.constantFrom('app', 'plan', 'blocked').map<AssertionResult>((failure) => ({ index, type: 'textVisible', ok: false, detail: 'no', failure })),
  );

const repResult = (k: number) =>
  fc
    .record({
      outcome: fc.constantFrom<RepOutcome>('completed', 'completed', 'timeout', 'planError', 'systemError'),
      assertions: fc.integer({ min: 0, max: 3 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => assertion(i)))),
    })
    .map<PairRepResult>(({ outcome, assertions }) => ({
      criterion: '1.1',
      persona: 'wraith',
      rep: k,
      outcome,
      steps: [],
      assertions: outcome === 'completed' ? assertions : [],
      blocked: [],
      artifacts: [],
      notes: [],
      startedAt: 0,
      endedAt: 0,
    }));

const run = fc.integer({ min: 1, max: 5 }).chain((reps) =>
  fc.tuple(...Array.from({ length: reps }, (_, i) => repResult(i + 1))).map((results) => ({ reps, results })),
);

const bugRank: Record<PairVerdict, number> = { inconclusive: 0, clean: 0, flaky: 1, haunted: 2, notApplicable: -1, uncompilable: -1 };

describe('computeVerdicts properties', () => {
  it('is deterministic', () => {
    fc.assert(
      fc.property(run, (r) => {
        expect(computeVerdicts([pair], r)).toEqual(computeVerdicts([pair], r));
      }),
    );
  });

  it("doesn't depend on result order", () => {
    fc.assert(
      fc.property(
        run.chain((r) => fc.shuffledSubarray(r.results, { minLength: r.results.length }).map((shuffled) => [r, shuffled] as const)),
        ([r, shuffled]) => {
          expect(computeVerdicts([pair], { reps: r.reps, results: shuffled })).toEqual(computeVerdicts([pair], r));
        },
      ),
    );
  });

  it('never lowers the bug signal when an assertion starts failing', () => {
    fc.assert(
      fc.property(run, fc.nat(), fc.nat(), (r, pickRep, pickAssertion) => {
        const candidates = r.results.filter((x) => x.outcome === 'completed' && x.assertions.some((a) => a.ok));
        fc.pre(candidates.length > 0);
        const target = candidates[pickRep % candidates.length]!;
        const passing = target.assertions.filter((a) => a.ok);
        const flip = passing[pickAssertion % passing.length]!;
        const after = r.results.map((x) =>
          x !== target
            ? x
            : { ...x, assertions: x.assertions.map((a) => (a === flip ? { ...a, ok: false, detail: 'no', failure: 'app' as const } : a)) },
        );
        const before = computeVerdicts([pair], r).pairs[0]!.verdict;
        const now = computeVerdicts([pair], { reps: r.reps, results: after }).pairs[0]!.verdict;
        expect(bugRank[now]).toBeGreaterThanOrEqual(bugRank[before]);
      }),
    );
  });
});
