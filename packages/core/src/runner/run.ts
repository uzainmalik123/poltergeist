import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { HauntingPlan } from '../compiler/dsl.js';
import type { LoadedConfig } from '../config/load.js';
import { runReset, type ResetResult } from '../config/reset.js';
import { compileForbidden } from '../safety/forbidden.js';
import { newGuardedContext, type BlockedRequest } from '../safety/guard.js';
import { startActor, currentStep, type ActorRun } from './actor.js';
import { ASSERT_POLL_MS, runAssertions, type ConsoleRecord } from './assertions.js';
import { BarrierSet } from './barrier.js';
import { RunnerSafetyError } from './errors.js';
import { createEventSink, type EventSink } from './events.js';
import { startFrames } from './frames.js';
import { installHolds, type Holds } from './holds.js';
import { blockAction, conflictKeys, planIdentity } from './match.js';
import { installOverlay } from './overlay.js';
import { runScheduled } from './schedule.js';
import { DEFAULT_SEED, pairSeed } from './seed.js';
import {
  ghostId,
  type ActorName,
  type AssertionResult,
  type PairRepResult,
  type RepOutcome,
  type RunOptions,
  type RunResult,
} from './types.js';

const STEP_TIMEOUT_MS = 5000;
const PLAN_TIMEOUT_MS = 60_000;
const DEFAULT_FPS = 4;
const MAX_FPS = 4;
/** How long to wait for an actor to notice its context closed before giving up on it. */
const SETTLE_MS = 2000;

const firstLine = (s: string) => s.split('\n')[0]?.trim() ?? '';
const message = (err: unknown) => firstLine(err instanceof Error ? err.message : String(err));
const now = () => performance.timeOrigin + performance.now();
/** A sleep that can be cancelled, so no timer outlives `runPlans` (a CLI would hang at exit). */
function timer(ms: number): { done: Promise<void>; cancel(): void } {
  let handle: NodeJS.Timeout | undefined;
  const done = new Promise<void>((r) => (handle = setTimeout(r, ms)));
  return { done, cancel: () => clearTimeout(handle) };
}

function intOption(name: string, value: number | undefined, fallback: number, min: number, max: number): number {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v < min || v > max) throw new RangeError(`${name} must be an integer ${min}…${max}, got ${v}`);
  return v;
}

type Shared = {
  browser: Browser;
  loaded: LoadedConfig;
  opts: RunOptions;
  sink: EventSink;
  seed: number;
  fps: number;
  stepTimeoutMs: number;
  planTimeoutMs: number;
  signal: AbortSignal;
  onLeak(b: BlockedRequest): void;
};

type Actor = { name: ActorName; ghost: string; context: BrowserContext; page: Page; holds: Holds; stopFrames?: () => Promise<void>; run?: ActorRun };

/**
 * Runs compiled plans against the target (Requirement 6, D-33): reps one after another with a reset before
 * each, plans inside a rep scheduled by context slots and conflict keys, every actor in its own guarded
 * context. Returns raw per-rep results for F07. A `leak` report aborts the run with `RunnerSafetyError`.
 * The caller launches `browser` with `guardLaunchOptions()`.
 */
export async function runPlans(browser: Browser, loaded: LoadedConfig, plans: readonly HauntingPlan[], opts: RunOptions): Promise<RunResult> {
  const reps = intOption('reps', opts.reps, loaded.config.reps, 1, 10);
  const fps = intOption('frameFps', opts.frameFps, DEFAULT_FPS, 0, MAX_FPS);
  const concurrency = intOption('concurrency', opts.concurrency, loaded.config.concurrency, 1, 20);
  const seed = opts.seed ?? DEFAULT_SEED;
  pairSeed(seed, '', ''); // validates the seed up front
  const started = performance.now();
  const sink = createEventSink({ outDir: opts.outDir, redactor: loaded.redactor, onEvent: opts.onEvent });
  const stop = new AbortController();
  const forward = () => stop.abort(opts.signal?.reason);
  if (opts.signal?.aborted) forward();
  opts.signal?.addEventListener('abort', forward, { once: true });
  let leak: BlockedRequest | undefined;

  const shared: Shared = {
    browser,
    loaded,
    opts,
    sink,
    seed,
    fps,
    stepTimeoutMs: opts.stepTimeoutMs ?? STEP_TIMEOUT_MS,
    planTimeoutMs: opts.planTimeoutMs ?? PLAN_TIMEOUT_MS,
    signal: stop.signal,
    onLeak(b) {
      if (leak) return;
      leak = b;
      // Actors stop at their next step. Closing contexts from inside the guard's callback races
      // Playwright's own dispatch ("object was not bound"), so contexts close in runPair's finally.
      stop.abort(new RunnerSafetyError(b));
    },
  };

  const results: PairRepResult[] = [];
  const resets: (ResetResult | null)[] = [];
  try {
    for (let rep = 1; rep <= reps && !stop.signal.aborted; rep++) {
      sink.emit({ type: 'rep.started', rep });
      const t = performance.now();
      let resetError: string | undefined;
      try {
        resets.push(await runReset(loaded));
        sink.emit({ type: 'reset.finished', rep, ok: true, durationMs: Math.round(performance.now() - t) });
      } catch (err) {
        resetError = `reset failed: ${message(err)}`;
        resets.push(null);
        sink.emit({ type: 'reset.finished', rep, ok: false, durationMs: Math.round(performance.now() - t), error: resetError });
      }

      let repResults: PairRepResult[];
      if (resetError !== undefined) {
        const at = now();
        repResults = plans.map((p) => blank(p, rep, 'systemError', at, loaded.redactor.redact(resetError)));
      } else {
        const settled = await runScheduled(
          plans.map((p) => ({ keys: conflictKeys(p), slots: p.actors.b ? 2 : 1, run: () => runPair(p, rep, shared) })),
          concurrency,
          stop.signal,
        );
        if (stop.signal.aborted) break;
        repResults = settled.map((s, i) =>
          s.status === 'fulfilled' ? s.value : blank(plans[i]!, rep, 'systemError', now(), loaded.redactor.redact(message(s.reason))),
        );
      }
      results.push(...repResults);
      const outcomes: Record<RepOutcome, number> = { completed: 0, timeout: 0, planError: 0, systemError: 0 };
      for (const r of repResults) outcomes[r.outcome]++;
      sink.emit({ type: 'rep.finished', rep, outcomes });
    }
  } finally {
    opts.signal?.removeEventListener('abort', forward);
    await sink.flush();
  }
  if (leak) throw new RunnerSafetyError(leak);
  if (stop.signal.aborted) throw opts.signal?.reason;
  return { results, reps, seed, resets, durationMs: Math.round(performance.now() - started) };
}

function blank(plan: HauntingPlan, rep: number, outcome: RepOutcome, at: number, error?: string): PairRepResult {
  return {
    criterion: plan.criterion,
    persona: plan.persona,
    rep,
    outcome,
    ...(error !== undefined ? { error } : {}),
    steps: [],
    assertions: [],
    blocked: [],
    artifacts: [],
    notes: [],
    startedAt: at,
    endedAt: at,
  };
}

async function runPair(plan: HauntingPlan, rep: number, s: Shared): Promise<PairRepResult> {
  const { loaded, sink } = s;
  const redact = (t: string) => loaded.redactor.redact(t);
  const result = blank(plan, rep, 'completed', now());
  const finish = (outcome: RepOutcome, error?: string) => {
    result.outcome = outcome;
    if (error !== undefined) result.error = redact(error);
    result.endedAt = now();
    return result;
  };

  const id = planIdentity(plan);
  if ('error' in id) return finish('planError', id.error);
  const storageState = id.identity === 'anonymous' ? undefined : s.opts.sessions.get(id.identity);
  if (id.identity !== 'anonymous' && !storageState) return finish('systemError', `no session for account "${id.identity}"`);

  const names: ActorName[] = plan.actors.b ? ['a', 'b'] : ['a'];
  const origin = loaded.config.target;
  const consoleErrors: ConsoleRecord[] = [];
  const pageErrors: string[] = [];
  const blockedUrls = new Set<string>();
  const barriers = new BarrierSet(names);
  const actors: Actor[] = [];
  const planStart = Date.now();

  try {
    for (const name of names) {
      const ghost = ghostId(plan.criterion, plan.persona, rep, name);
      const onBlocked = (b: BlockedRequest) => {
        const safe = { ...b, url: redact(b.url) };
        result.blocked.push(safe);
        blockedUrls.add(b.url);
        sink.emit({ type: 'guard.blocked', ghostId: ghost, reason: b.reason, url: safe.url });
        const action = blockAction(b);
        if (action === 'abort-run') s.onLeak(b);
        else if (action === 'blocked-by-rule') {
          const run = actors.find((a) => a.name === name)?.run;
          const step = run && currentStep(run);
          if (step) step.outcome = 'blocked-by-rule';
        }
      };
      const context = await newGuardedContext(
        s.browser,
        { allowedHosts: loaded.allowedHosts, forbidden: loaded.config.forbidden, onBlocked },
        storageState ? { storageState } : {},
      );
      const holds = await installHolds(context, origin);
      await installOverlay(context);
      // A context seeded with a session would put its cookies in the trace (D-20, Req 2.8): no trace.
      if (s.opts.outDir && !storageState) await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push({ text: m.text(), url: m.location().url });
      });
      page.on('pageerror', (e) => pageErrors.push(e.message));
      const actor: Actor = { name, ghost, context, page, holds };
      if (s.fps > 0) actor.stopFrames = await startFrames(page, s.fps, (jpeg) => sink.frame(ghost, jpeg));
      actors.push(actor);
      sink.emit({ type: 'ghost.spawned', ghostId: ghost, criterion: plan.criterion, persona: plan.persona, rep, actor: name });
    }

    const seed = pairSeed(s.seed, plan.criterion, plan.persona);
    const runs = actors.map((a) => {
      const started = startActor(plan.actors[a.name] ?? [], {
        actor: a.name,
        page: a.page,
        context: a.context,
        origin,
        loaded,
        holds: a.holds,
        barriers,
        seed,
        stepTimeoutMs: s.stepTimeoutMs,
        signal: s.signal,
        onStep: (r, xy) => sink.emit({ type: 'ghost.step', ghostId: a.ghost, index: r.index, step: r.type, outcome: r.outcome, ...xy }),
      });
      a.run = started.run;
      return started;
    });
    const all = Promise.all(runs.map((r) => r.done));
    const budget = timer(Math.max(0, planStart + s.planTimeoutMs - Date.now()));
    const timedOut = await Promise.race([all.then(() => false), budget.done.then(() => true)]).finally(budget.cancel);
    if (timedOut) {
      for (const a of actors) {
        barriers.leave(a.name);
        a.holds.releaseAll();
      }
    }
    result.steps = actors.flatMap((a) => a.run!.steps);

    const ends = actors.map((a) => a.run!.end);
    let outcome: RepOutcome = 'completed';
    let error: string | undefined;
    if (timedOut) [outcome, error] = ['timeout', `plan exceeded ${s.planTimeoutMs} ms`];
    else if (ends.includes('timeout')) [outcome, error] = ['timeout', actors.find((a) => a.run!.end === 'timeout')!.run!.error];
    else if (ends.some((e) => e !== 'done')) [outcome, error] = ['planError', actors.find((a) => a.run!.end !== 'done')!.run!.error];

    if (outcome === 'completed') {
      const first = actors[0]!;
      result.assertions = await runAssertions(plan.assert, {
        page: first.page,
        context: first.context,
        origin,
        allowedHosts: loaded.allowedHosts,
        forbidden: compileForbidden(loaded.config.forbidden ?? []),
        redactor: loaded.redactor,
        consoleErrors,
        pageErrors,
        blockedUrls,
        pollMs: ASSERT_POLL_MS,
        deadline: planStart + s.planTimeoutMs,
      });
      for (const a of result.assertions) {
        sink.emit({ type: 'assert.result', criterion: plan.criterion, persona: plan.persona, rep, index: a.index, ok: a.ok, detail: a.detail });
      }
    }

    await keepEvidence(plan, rep, s, actors, result, outcome !== 'completed', result.assertions, storageState !== undefined);
    finish(outcome, error);
    if (timedOut) {
      const settle = timer(SETTLE_MS);
      await Promise.race([all.catch(() => undefined), settle.done]).finally(settle.cancel);
    }
    return result;
  } catch (err) {
    return finish('systemError', message(err));
  } finally {
    for (const a of actors) {
      await a.stopFrames?.();
      await a.context.close().catch(() => undefined);
    }
  }
}

/** Screenshots on failed assertions, a trace per failed rep, nothing for a passing rep (Req 6.7, D-33). */
async function keepEvidence(
  plan: HauntingPlan,
  rep: number,
  s: Shared,
  actors: Actor[],
  result: PairRepResult,
  repFailed: boolean,
  assertions: AssertionResult[],
  fromSession: boolean,
): Promise<void> {
  const outDir = s.opts.outDir;
  if (!outDir) return;
  const assertFailed = assertions.some((a) => !a.ok);
  const failed = repFailed || assertFailed;
  const rel = `artifacts/${plan.criterion}__${plan.persona}__rep${rep}`;
  if (failed) await mkdir(join(outDir, rel), { recursive: true });
  for (const a of actors) {
    if (failed && assertFailed) {
      const file = `${rel}/screenshot-${a.name}.png`;
      if (await a.page.screenshot({ path: join(outDir, file), timeout: s.stepTimeoutMs }).then(() => true, () => false)) {
        result.artifacts.push(file);
      }
    }
    if (fromSession) {
      if (failed) result.notes.push(`trace dropped for actor ${a.name}: it started from a session (cookies are secrets)`);
    } else if (failed && !a.run?.loggedIn) {
      const file = `${rel}/trace-${a.name}.zip`;
      if (await a.context.tracing.stop({ path: join(outDir, file) }).then(() => true, () => false)) result.artifacts.push(file);
    } else {
      if (failed) result.notes.push(`trace dropped for actor ${a.name}: it ran a login step (secrets)`);
      await a.context.tracing.stop().catch(() => undefined);
    }
  }
}
