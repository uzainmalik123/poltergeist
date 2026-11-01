import type { PairResult } from '../compiler/compile.js';
import type { PersonaId } from '../personas/registry.js';
import type { PairRepResult, RunResult } from '../runner/types.js';
import { decidePair } from './pair.js';
import { emptyCounts, threshold, type CriterionVerdict, type PairVerdict, type PairVerdictRecord } from './types.js';

export type CriterionVerdictRecord = { criterion: string; verdict: CriterionVerdict; personas: Partial<Record<PersonaId, PairVerdict>> };

export type Verdicts = {
  reps: number;
  threshold: number;
  /** In the input order of `pairs`. */
  pairs: PairVerdictRecord[];
  /** In first-seen criterion order. */
  criteria: CriterionVerdictRecord[];
  counts: Record<PairVerdict, number>;
};

const PRECEDENCE = ['haunted', 'flaky', 'inconclusive', 'clean'] as const;

/** A criterion's verdict from its pairs (Req 7.4): `notApplicable` is ignored, `uncompilable` counts as `inconclusive`. */
export function rollUp(verdicts: readonly PairVerdict[]): CriterionVerdict {
  const seen = new Set(verdicts.filter((v) => v !== 'notApplicable').map((v) => (v === 'uncompilable' ? 'inconclusive' : v)));
  return PRECEDENCE.find((v) => seen.has(v)) ?? 'notApplicable';
}

const key = (criterion: string, persona: string) => `${criterion}/${persona}`;

/**
 * Pair and criterion verdicts from F05's compile statuses and F06's raw rep results (Requirement 7, D-34).
 * Pure: no I/O, no events, and the result doesn't depend on the order of `run.results`.
 */
export function computeVerdicts(pairs: readonly PairResult[], run: Pick<RunResult, 'reps' | 'results'>): Verdicts {
  const { reps } = run;
  const compiled = new Map<string, PairRepResult[]>();
  const seenPairs = new Set<string>();
  for (const p of pairs) {
    const k = key(p.criterion, p.persona);
    if (seenPairs.has(k)) throw new TypeError(`duplicate pair ${k}`);
    seenPairs.add(k);
    if (p.status === 'compiled') compiled.set(k, []);
  }
  const seenReps = new Set<string>();
  for (const r of run.results) {
    const k = key(r.criterion, r.persona);
    const list = compiled.get(k);
    if (!list) throw new TypeError(`run result for ${k} has no compiled plan`);
    if (!Number.isInteger(r.rep) || r.rep < 1 || r.rep > reps) throw new TypeError(`result for ${k} has rep ${r.rep}, outside 1…${reps}`);
    if (seenReps.has(`${k}#${r.rep}`)) throw new TypeError(`duplicate result for ${k} rep ${r.rep}`);
    seenReps.add(`${k}#${r.rep}`);
    list.push(r);
  }

  const records = pairs.map((p): PairVerdictRecord => {
    if (p.status === 'compiled') return decidePair(p.criterion, p.persona, reps, compiled.get(key(p.criterion, p.persona))!);
    return {
      criterion: p.criterion,
      persona: p.persona,
      verdict: p.status,
      reason: p.reason,
      reps,
      threshold: threshold(reps),
      assertions: [],
      failedReps: [],
      outcomes: emptyCounts(),
      evidence: [],
      notes: p.status === 'uncompilable' ? [...p.errors] : [],
    };
  });

  const byCriterion = new Map<string, PairVerdictRecord[]>();
  for (const r of records) byCriterion.set(r.criterion, [...(byCriterion.get(r.criterion) ?? []), r]);
  const criteria = [...byCriterion].map(([criterion, rs]) => ({
    criterion,
    verdict: rollUp(rs.map((r) => r.verdict)),
    personas: Object.fromEntries(rs.map((r) => [r.persona, r.verdict])) as Partial<Record<PersonaId, PairVerdict>>,
  }));

  const counts: Record<PairVerdict, number> = { haunted: 0, flaky: 0, inconclusive: 0, clean: 0, notApplicable: 0, uncompilable: 0 };
  for (const r of records) counts[r.verdict]++;
  return { reps, threshold: threshold(reps), pairs: records, criteria, counts };
}
