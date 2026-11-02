import { relative } from 'node:path';
import type { CriterionVerdict, SummonResult } from '@poltergeist/core';

/** Every tool result's text stays under this (≈ < 2k tokens, PRD F11, Req 10.2). */
export const MAX_TEXT = 6000;
export const MAX_IDS = 20;

export function capText(s: string, max = MAX_TEXT): string {
  if (s.length <= max) return s;
  // The note's digits can't exceed the input's, so reserve for the worst case.
  const note = (n: number) => `\n… truncated (${n} more chars)`;
  const keep = max - note(s.length).length;
  return s.slice(0, keep) + note(s.length - keep);
}

export function capIds(ids: readonly string[], max = MAX_IDS): string[] {
  return ids.length <= max ? [...ids] : [...ids.slice(0, max), `+${ids.length - max} more`];
}

export type RunProgress = { phase: string; plansDone: number; plansTotal: number; repsDone: number; reps: number };

export type RunSummary = {
  runId: string;
  status: 'running' | 'finished' | 'failed';
  counts?: Record<CriterionVerdict | 'notRun', number>;
  haunted?: string[];
  flaky?: string[];
  reportPath?: string;
  progress?: RunProgress;
  error?: string;
  hint?: string;
};

/** The agent-sized summary of a finished run: counts and ids, never artifacts (Req 10.2). */
export function summarize(result: SummonResult, cwdForPaths: string): RunSummary {
  const counts: Record<CriterionVerdict | 'notRun', number> = { haunted: 0, flaky: 0, inconclusive: 0, clean: 0, notApplicable: 0, notRun: 0 };
  const verdictOf = new Map(result.verdicts.criteria.map((c) => [c.criterion, c.verdict]));
  for (const c of result.criteria) counts[verdictOf.get(c.id) ?? 'notRun']++;
  const flaky = result.criteria.filter((c) => verdictOf.get(c.id) === 'flaky').map((c) => c.id);
  const summary: RunSummary = {
    runId: result.runId,
    status: 'finished',
    counts,
    haunted: capIds(result.haunted),
    flaky: capIds(flaky),
    reportPath: relative(cwdForPaths, result.reportPaths.markdownPath).split('\\').join('/'),
  };
  if (result.allResetsFailed) {
    summary.error = `every reset failed, so nothing ran: ${result.resetError ?? 'unknown error'}`;
    summary.hint = 'Fix resetCommand in poltergeist.config.json, then call summon_ghosts again.';
  } else if (result.haunted.length > 0) {
    summary.hint = `Call get_haunting_report with criterion "${result.haunted[0]}" for the failing steps, fix the code, then call rehaunt with the fixed ids.`;
  }
  return summary;
}
