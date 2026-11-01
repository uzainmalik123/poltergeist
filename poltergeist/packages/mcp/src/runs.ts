import { newRunId, summon as coreSummon, type SummonEvent, type SummonOptions, type SummonResult } from '@poltergeist/core';
import { summarize, type RunProgress, type RunSummary } from './format.js';

export type SummonFn = (opts: SummonOptions) => Promise<SummonResult>;
export type StartOptions = Omit<SummonOptions, 'runId' | 'signal' | 'onEvent' | 'onWarning'>;

export class RunBusyError extends Error {
  override name = 'RunBusyError';
  constructor(readonly activeRunId: string) {
    super(`run ${activeRunId} is still going; call get_run_status with that runId and wait for it to finish`);
  }
}

export class UnknownRunError extends Error {
  override name = 'UnknownRunError';
  constructor(runId: string) {
    super(`unknown runId ${runId} (this server never started it, or forgot it); call summon_ghosts to start a run`);
  }
}

/** Settled runs kept for `get_run_status`. */
const KEEP_SETTLED = 20;

type Run = { id: string; ac: AbortController; settled: Promise<void>; summary?: RunSummary; progress: RunProgress };

function phaseOf(type: SummonEvent['type']): string | undefined {
  if (type === 'scout.route') return 'scout';
  if (type === 'plan.compiled') return 'compile';
  if (type.startsWith('rep.') || type.startsWith('ghost.') || type.startsWith('reset.') || type.startsWith('assert.')) return 'run';
  if (type.startsWith('verdict.')) return 'verdicts';
  return undefined;
}

/**
 * At most one haunting per server process, run in the background (D-38, KI-12). Tools
 * long-poll it with `wait`, so no single MCP call outlives the client's request timeout.
 */
export class RunManager {
  private readonly runs = new Map<string, Run>();
  private active: Run | undefined;
  private readonly summon: SummonFn;
  private readonly root: string;
  private readonly log: (msg: string) => void;

  constructor(opts: { summon?: SummonFn; root: string; log?: (msg: string) => void }) {
    this.summon = opts.summon ?? coreSummon;
    this.root = opts.root;
    this.log = opts.log ?? (() => undefined);
  }

  start(opts: StartOptions): string {
    if (this.active) throw new RunBusyError(this.active.id);
    let id = newRunId();
    while (this.runs.has(id)) id = newRunId();
    const ac = new AbortController();
    const progress: RunProgress = { phase: 'starting', plansDone: 0, plansTotal: 0, repsDone: 0, reps: 0 };
    const onEvent = (e: SummonEvent) => {
      if (e.type === 'run.started') {
        progress.plansTotal = e.criteria.length * e.personas.length;
        progress.reps = e.reps;
      } else if (e.type === 'plan.compiled') progress.plansDone++;
      else if (e.type === 'rep.finished') progress.repsDone++;
      progress.phase = phaseOf(e.type) ?? progress.phase;
    };
    const run: Run = { id, ac, progress, settled: Promise.resolve() };
    run.settled = this.summon({ ...opts, runId: id, signal: ac.signal, onEvent, onWarning: this.log }).then(
      (result) => {
        run.summary = summarize(result, this.root);
      },
      (err: unknown) => {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        this.log(`run ${id} failed: ${message}`);
        run.summary = { runId: id, status: 'failed', error: message };
      },
    ).finally(() => {
      if (this.active === run) this.active = undefined;
      this.forgetOld();
    });
    this.runs.set(id, run);
    this.active = run;
    return id;
  }

  async wait(runId: string, waitMs: number): Promise<RunSummary> {
    const run = this.runs.get(runId);
    if (!run) throw new UnknownRunError(runId);
    if (!run.summary && waitMs > 0) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([run.settled, new Promise((r) => (timer = setTimeout(r, waitMs)))]);
      clearTimeout(timer);
    }
    return run.summary ?? { runId, status: 'running', progress: { ...run.progress }, hint: 'Call get_run_status with this runId to keep waiting.' };
  }

  async abortAll(): Promise<void> {
    const run = this.active;
    if (!run) return;
    run.ac.abort(new DOMException('server shutting down', 'AbortError'));
    await run.settled;
  }

  private forgetOld() {
    const settled = [...this.runs.values()].filter((r) => r.summary);
    for (const r of settled.slice(0, Math.max(0, settled.length - KEEP_SETTLED))) this.runs.delete(r.id);
  }
}
