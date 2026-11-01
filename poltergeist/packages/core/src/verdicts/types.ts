import type { PersonaId } from '../personas/registry.js';
import type { RepOutcome } from '../runner/types.js';

export type PairVerdict = 'haunted' | 'flaky' | 'inconclusive' | 'clean' | 'notApplicable' | 'uncompilable';
export type CriterionVerdict = Exclude<PairVerdict, 'uncompilable'>;

/** How often one assertion (by its index in the plan) failed because of the app. */
export type AssertionTally = { index: number; type: string; failures: number; lastDetail: string };

/** `voided`: completed, but a forbidden rule blocked a request. `missing`: no result for that rep. */
export type RepCounts = Record<RepOutcome | 'voided' | 'missing', number>;

export type PairVerdictRecord = {
  criterion: string;
  persona: PersonaId;
  verdict: PairVerdict;
  /** One plain line saying why (F08 owns the wording around it). */
  reason: string;
  reps: number;
  threshold: number;
  /** Assertions that failed with `failure: 'app'` in a counted rep, by ascending index. */
  assertions: AssertionTally[];
  /** The lowest index with the highest failure count. */
  failingAssertion?: AssertionTally;
  /** Reps (1-based, ascending) with at least one counted app failure. */
  failedReps: number[];
  outcomes: RepCounts;
  /** Artifacts of `failedReps`, in rep order. */
  evidence: string[];
  notes: string[];
};

/** Fails needed out of N reps to call a pair `haunted` (D-06, Req 7.1). */
export const threshold = (n: number): number => Math.ceil((2 * n) / 3);

export const emptyCounts = (): RepCounts => ({ completed: 0, timeout: 0, planError: 0, systemError: 0, voided: 0, missing: 0 });
