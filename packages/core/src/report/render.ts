import { join, relative, sep } from 'node:path';
import type { PairResult } from '../compiler/compile.js';
import type { HauntingPlan } from '../compiler/dsl.js';
import type { Criterion } from '../spec/types.js';
import type { Verdicts } from '../verdicts/compute.js';
import type { CriterionVerdict, PairVerdictRecord } from '../verdicts/types.js';
import { DRAFT_WORDMARK, VERDICT_GLYPHS } from './glyphs.js';
import type { ReportJson } from './schema.js';
import { codeSpan, describeAssertion, describeStep, oneLine } from './text.js';

/** Hard cap on `haunting-report.md` (PRD F08, D-35). The JSON always has everything. */
export const REPORT_MAX_LINES = 300;

/** At most this many artifact paths per pair in the markdown. */
const MAX_ARTIFACTS = 6;

export type RunMeta = {
  runId: string;
  /** Absolute path of the run folder. */
  runDir: string;
  target: string;
  reps: number;
  model: string;
  /** Epoch ms. */
  startedAt: number;
};

export type ReportInput = {
  /** Absolute path of the spec folder the report is written into. */
  specDir: string;
  criteria: readonly Criterion[];
  compiled: readonly PairResult[];
  verdicts: Verdicts;
  run: RunMeta;
  /** Defaults to THEME §4's draft until F26 passes the Costume Kit's (KI-40). */
  wordmark?: string;
};

export type RenderedReport = { markdown: string; json: ReportJson };

type Verdict = CriterionVerdict | 'notRun';
type JsonPair = ReportJson['criteria'][number]['pairs'][number];

/** Pure: the report's markdown and JSON for one run (Req 8, D-35). */
export function renderReport(input: ReportInput): RenderedReport {
  const { specDir, run } = input;
  const plans = new Map<string, HauntingPlan>();
  for (const p of input.compiled) if (p.status === 'compiled') plans.set(pairKey(p.criterion, p.persona), p.plan);
  const verdictOf = new Map(input.verdicts.criteria.map((c) => [c.criterion, c.verdict]));
  const pairsOf = new Map<string, PairVerdictRecord[]>();
  for (const p of input.verdicts.pairs) pairsOf.set(p.criterion, [...(pairsOf.get(p.criterion) ?? []), p]);
  const rel = (artifact: string) => relative(specDir, join(run.runDir, artifact)).split(sep).join('/');

  const rows = input.criteria.map((c) => {
    const verdict: Verdict = verdictOf.get(c.id) ?? 'notRun';
    const pairs = (pairsOf.get(c.id) ?? []).map((p) => jsonPair(p, plans.get(pairKey(p.criterion, p.persona)), rel));
    return { c, verdict, pairs };
  });

  const counts: Record<Verdict, number> = { haunted: 0, flaky: 0, inconclusive: 0, clean: 0, notApplicable: 0, notRun: 0 };
  for (const r of rows) counts[r.verdict]++;

  const head = [
    '# Haunting report',
    '',
    '```text',
    input.wordmark ?? DRAFT_WORDMARK,
    '```',
    '',
    `Run ${codeSpan(run.runId)} against ${codeSpan(run.target)} · ${run.reps} reps · ${oneLine(run.model, 80)} · ${new Date(run.startedAt).toISOString()}`,
    `**${counts.haunted} haunted** [!!] · ${counts.flaky} flaky [~~] · ${counts.inconclusive} inconclusive [??] · ${counts.clean} clean [ok] · ${counts.notApplicable} n/a [--] · ${counts.notRun} not run [  ]`,
  ].join('\n').split('\n');
  const board = rows.map((r) => `- ${VERDICT_GLYPHS[r.verdict]} ${r.c.id} — ${oneLine(r.c.text)}`);
  const haunted = rows.filter((r) => r.verdict === 'haunted').map((r) => hauntedSection(r.c, r.pairs));
  const flaky = rows.filter((r) => r.verdict === 'flaky').map((r) => flakySection(r.c, r.pairs));
  const inconclusive = rows.flatMap((r) =>
    r.pairs.filter((p) => p.verdict === 'inconclusive' || p.verdict === 'uncompilable').map((p) => `- ${VERDICT_GLYPHS[p.verdict]} ${r.c.id} ${p.persona}: ${codeSpan([p.reason, ...p.notes.slice(0, 1)].join('; '))}`),
  );

  const keep = { board: board.length, haunted: haunted.length, flaky: flaky.length, inconclusive: inconclusive.length };
  const total = keep.board + keep.haunted + keep.flaky + keep.inconclusive;
  const trailer = (n: number) => `_Trimmed to fit ${REPORT_MAX_LINES} lines: ${n} more item(s) are in \`haunting-report.json\`._`;
  const assemble = () => {
    const dropped = total - (keep.board + keep.haunted + keep.flaky + keep.inconclusive);
    const out = [...head, '', '## Board', '', ...board.slice(0, keep.board)];
    if (haunted.length + flaky.length === 0) out.push('', 'No haunted or flaky criteria.');
    if (keep.haunted) out.push('', '## Haunted', ...haunted.slice(0, keep.haunted).flat());
    if (keep.flaky) out.push('', '## Flaky', ...flaky.slice(0, keep.flaky).flat());
    if (keep.inconclusive) out.push('', '## Inconclusive', '', ...inconclusive.slice(0, keep.inconclusive));
    if (dropped) out.push('', trailer(dropped));
    return { out, dropped };
  };
  let result = assemble();
  // The first fix-ready task outlives the board (Req 8.2); a hard cut is the last resort.
  for (const [part, min] of [['inconclusive', 0], ['flaky', 0], ['haunted', 1], ['board', 0], ['haunted', 0]] as const) {
    while (result.out.length > REPORT_MAX_LINES && keep[part] > min) {
      keep[part]--;
      result = assemble();
    }
  }
  if (result.out.length > REPORT_MAX_LINES) result = { out: [...result.out.slice(0, REPORT_MAX_LINES - 2), '', trailer(result.dropped)], dropped: result.dropped };

  const json: ReportJson = {
    version: 1,
    runId: run.runId,
    target: run.target,
    model: run.model,
    reps: run.reps,
    startedAt: new Date(run.startedAt).toISOString(),
    specFile: 'requirements.md',
    counts,
    criteria: rows.map(({ c, verdict, pairs }) => ({ id: c.id, requirement: c.requirement, text: c.text, line: c.line, verdict, pairs })),
    truncated: result.dropped,
  };
  return { markdown: result.out.join('\n') + '\n', json };
}

const pairKey = (criterion: string, persona: string) => `${criterion}\u0000${persona}`;

function jsonPair(p: PairVerdictRecord, plan: HauntingPlan | undefined, rel: (a: string) => string): JsonPair {
  const expected = plan?.assert.map(describeAssertion) ?? [];
  const failing = [...p.assertions]
    .sort((x, y) => y.failures - x.failures || x.index - y.index)
    .map((f) => ({ index: f.index, type: f.type, expected: expected[f.index] ?? f.type, failures: f.failures, lastDetail: f.lastDetail }));
  return {
    persona: p.persona,
    verdict: p.verdict,
    reason: p.reason,
    notes: p.notes,
    ...(plan ? { intent: plan.intent, steps: { a: plan.actors.a.map(describeStep), ...(plan.actors.b ? { b: plan.actors.b.map(describeStep) } : {}) } } : {}),
    reps: p.reps,
    repsRun: p.reps - p.outcomes.missing,
    threshold: p.threshold,
    expected,
    failing,
    failedReps: p.failedReps,
    outcomes: p.outcomes,
    artifacts: p.evidence.map(rel),
  };
}

const failedLine = (p: JsonPair) =>
  `failed ${p.failing[0]?.failures ?? 0}/${p.reps} reps${p.repsRun < p.reps ? ` (only ${p.repsRun} ran)` : ''}`;

function promise(c: Criterion): string {
  return `**Promise:** \`requirements.md\` line ${c.line}, Requirement ${c.requirementId} (${oneLine(c.requirement, 80)}): ${codeSpan(c.text)}`;
}

/** A fix-ready task (Req 8.2): the promise, persona, steps, expected vs actual, artifacts. */
function hauntedSection(c: Criterion, pairs: JsonPair[]): string[] {
  const out = ['', `### ${VERDICT_GLYPHS.haunted} ${c.id} — ${oneLine(c.text)}`, '', promise(c)];
  for (const p of pairs.filter((x) => x.verdict === 'haunted')) {
    out.push('', `#### ${p.persona} — ${failedLine(p)}`);
    if (p.intent) out.push('', `**Intent:** ${oneLine(p.intent)}`);
    if (p.steps) {
      const actors: [string, string[]][] = p.steps.b ? [['Actor a:', p.steps.a], ['Actor b:', p.steps.b]] : [['Steps:', p.steps.a]];
      for (const [label, steps] of actors) out.push('', label, '', ...steps.map((s, i) => `${i + 1}. ${s}`));
    }
    if (p.failedReps.length) out.push('', `**Failed in reps:** ${p.failedReps.join(', ')}`);
    for (const f of p.failing) {
      out.push('', `**Expected:** ${f.expected}`, '', `**Actual** (failed ${f.failures}/${p.reps} reps, last seen): ${codeSpan(f.lastDetail)}`);
    }
    if (p.notes.length) out.push('', `**Run notes:** ${codeSpan(p.notes.join('; '))}`);
    if (p.artifacts.length) {
      out.push('', "**Artifacts** (paths relative to this report's folder):", '', ...p.artifacts.slice(0, MAX_ARTIFACTS).map((a) => `- ${codeSpan(a)}`));
      if (p.artifacts.length > MAX_ARTIFACTS) out.push(`- …and ${p.artifacts.length - MAX_ARTIFACTS} more in \`haunting-report.json\``);
    }
  }
  out.push('', `**Fix:** change the app so this promise holds for the flow above, then re-run Poltergeist on ${c.id}.`);
  return out;
}

function flakySection(c: Criterion, pairs: JsonPair[]): string[] {
  const out = ['', `### ${VERDICT_GLYPHS.flaky} ${c.id} — ${oneLine(c.text)}`, ''];
  for (const p of pairs.filter((x) => x.verdict === 'flaky')) {
    const f = p.failing[0]!;
    const other = p.notes.length ? ` (run notes: ${codeSpan(p.notes.join('; '))})` : '';
    out.push(`- ${p.persona} ${failedLine(p)}: ${f.expected} — ${codeSpan(f.lastDetail)}${other}`);
  }
  return out;
}
