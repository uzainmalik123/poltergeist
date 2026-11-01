import type { PersonaId } from '../personas/registry.js';
import type { PairRepResult } from '../runner/types.js';
import { emptyCounts, threshold, type AssertionTally, type PairVerdict, type PairVerdictRecord } from './types.js';

const SUMMARY_ORDER = ['planError', 'systemError', 'timeout', 'voided', 'missing'] as const;

const voided = (r: PairRepResult) => r.blocked.some((b) => b.reason === 'forbidden') || r.steps.some((s) => s.outcome === 'blocked-by-rule');

/**
 * One pair's verdict from its reps (Req 7.1–7.3, D-06, D-34). Only an assertion that failed with
 * `failure: 'app'` in a completed rep counts; plan, system and timeout reps, and reps where a forbidden
 * rule blocked a request, never make a pair `haunted` or `flaky`. `results` holds at most one per rep.
 */
export function decidePair(criterion: string, persona: PersonaId, reps: number, results: readonly PairRepResult[]): PairVerdictRecord {
  const need = threshold(reps);
  const byRep = new Map(results.map((r) => [r.rep, r]));
  const outcomes = emptyCounts();
  const tallies = new Map<number, AssertionTally>();
  const failedReps: number[] = [];
  const evidence: string[] = [];
  const notes: string[] = [];
  let clean = 0;

  for (let k = 1; k <= reps; k++) {
    const r = byRep.get(k);
    if (!r) {
      outcomes.missing++;
      continue;
    }
    for (const n of r.notes) notes.push(`rep ${k}: ${n}`);
    if (r.error !== undefined) notes.push(`rep ${k}: ${r.error}`);
    if (r.outcome !== 'completed') {
      outcomes[r.outcome]++;
      continue;
    }
    if (voided(r)) {
      outcomes.voided++;
      notes.push(`rep ${k}: a forbidden rule blocked a request; its assertions don't count`);
      continue;
    }
    outcomes.completed++;
    const appFailures = r.assertions.filter((a) => !a.ok && a.failure === 'app');
    if (r.assertions.every((a) => a.ok)) clean++;
    if (appFailures.length === 0) continue;
    failedReps.push(k);
    evidence.push(...r.artifacts);
    for (const a of appFailures) {
      const t = tallies.get(a.index) ?? { index: a.index, type: a.type, failures: 0, lastDetail: '' };
      t.failures++;
      t.lastDetail = a.detail;
      tallies.set(a.index, t);
    }
  }

  const assertions = [...tallies.values()].sort((a, b) => a.index - b.index);
  const top = assertions.reduce<AssertionTally | undefined>((best, t) => (!best || t.failures > best.failures ? t : best), undefined);

  let verdict: PairVerdict;
  let reason: string;
  if (top && top.failures >= need) {
    verdict = 'haunted';
    reason = `assertion ${top.index} (${top.type}) failed in ${top.failures} of ${reps} reps: ${top.lastDetail}`;
  } else if (top) {
    verdict = 'flaky';
    reason = `assertion ${top.index} (${top.type}) failed in ${top.failures} of ${reps} reps (needs ${need} to reproduce); ${outcomes.completed} of ${reps} reps completed`;
  } else if (clean >= need) {
    verdict = 'clean';
    reason = `all assertions passed in ${clean} of ${reps} reps`;
  } else {
    verdict = 'inconclusive';
    const summary = SUMMARY_ORDER.filter((o) => outcomes[o] > 0).map((o) => `${outcomes[o]} ${o}`);
    reason = `only ${clean} of ${reps} reps completed cleanly (needs ${need})${summary.length ? `; ${summary.join(', ')}` : ''}`;
  }

  return {
    criterion,
    persona,
    verdict,
    reason,
    reps,
    threshold: need,
    assertions,
    ...(top ? { failingAssertion: top } : {}),
    failedReps,
    outcomes,
    evidence,
    notes,
  };
}
