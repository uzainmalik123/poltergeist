import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type LaunchOptions } from 'playwright-core';
import { compile } from '../compiler/compile.js';
import type { HauntingPlan } from '../compiler/dsl.js';
import { createAnthropicClient } from '../compiler/llm.js';
import { loadConfig } from '../config/load.js';
import { isPersonaId, PERSONA_IDS, type PersonaId } from '../personas/registry.js';
import { renderReport } from '../report/render.js';
import { writeReport } from '../report/write.js';
import { createEventSink } from '../runner/events.js';
import { runPlans } from '../runner/run.js';
import { guardLaunchOptions } from '../safety/guard.js';
import { scout } from '../scout/scout.js';
import { parseSpec } from '../spec/read.js';
import { computeVerdicts } from '../verdicts/compute.js';
import { UsageError } from './errors.js';
import { newRunId } from './run-id.js';
import type { SummonEvent, SummonOptions, SummonResult } from './types.js';

/**
 * Guarded launch options with Playwright's own SIGINT handler off: it would close the browser and
 * `process.exit(130)` itself, skipping the caller's abort path, cleanup and final event flush.
 */
export function summonLaunchOptions(): LaunchOptions {
  return guardLaunchOptions({ handleSIGINT: false });
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

function selectPersonas(ids: readonly string[] | undefined): PersonaId[] {
  const unique = [...new Set(ids ?? PERSONA_IDS)];
  const bad = unique.find((id) => !isPersonaId(id));
  if (bad !== undefined) throw new UsageError(`unknown persona: ${bad} (known: ${PERSONA_IDS.join(', ')})`);
  return unique as PersonaId[];
}

/**
 * The whole haunting: config → spec → scout → compile → run → verdicts → report (Req 9, D-36).
 * The CLI, the MCP server and the Séance all call this. Errors keep their own classes for exit codes.
 */
export async function summon(opts: SummonOptions): Promise<SummonResult> {
  const cwd = opts.cwd ?? process.cwd();
  const specDir = resolve(cwd, opts.specDir);
  const warn = (message: string) => opts.onWarning?.(message);
  const loaded = await loadConfig({ path: opts.configPath, cwd, env: opts.env });
  for (const w of loaded.warnings) warn(w.message);

  const { criteria: all } = await parseSpec(specDir);
  let criteria = all;
  if (opts.only) {
    const known = new Set(all.map((c) => c.id));
    const bad = opts.only.find((id) => !known.has(id));
    if (bad !== undefined) throw new UsageError(`unknown criterion id: ${bad} (known: ${all.map((c) => c.id).join(', ')})`);
    const wanted = new Set(opts.only);
    criteria = all.filter((c) => wanted.has(c.id));
  }
  if (criteria.length === 0) throw new UsageError(`no acceptance criteria to haunt in ${join(specDir, 'requirements.md')}`);
  const personas = selectPersonas(opts.personas);
  const reps = opts.reps ?? loaded.config.reps;
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) throw new UsageError(`reps must be an integer 1–10, got ${reps}`);

  const runId = opts.runId ?? newRunId();
  const home = join(loaded.configDir, '.poltergeist');
  const runDir = join(home, 'runs', runId);
  const cacheDir = join(home, 'cache', 'plans');
  const { target, model } = loaded.config;
  const startedAt = Date.now();
  const sink = createEventSink<SummonEvent>({ outDir: runDir, redactor: loaded.redactor, onEvent: opts.onEvent });

  sink.emit({ type: 'run.started', runId, specDir, target, criteria: criteria.map((c) => c.id), personas, reps });
  const specHash = createHash('sha256').update(await readFile(join(specDir, 'requirements.md'))).digest('hex');
  const runJson: Record<string, unknown> = {
    runId, specDir, specHash, config: loaded.snapshot, model,
    options: { only: opts.only ?? null, personas, reps, recompile: opts.recompile ?? false },
    startedAt,
  };
  await sink.flush();
  await writeFile(join(runDir, 'run.json'), json(runJson));

  const launch = opts.launch ?? (() => chromium.launch(summonLaunchOptions()));
  const signal = opts.signal;
  let resetError: string | undefined;
  const browser = await launch();
  let scouted, compiled, run;
  try {
    signal?.throwIfAborted();
    scouted = await scout(browser, loaded, {
      outDir: runDir,
      signal,
      onRoute: (r) => sink.emit({ type: 'scout.route', path: r.path, identity: r.identity, status: r.status }),
    });
    signal?.throwIfAborted();
    compiled = await compile(criteria, scouted, {
      client: opts.llm ?? createAnthropicClient(),
      model,
      cacheDir,
      outDir: runDir,
      personas,
      recompile: opts.recompile,
      signal,
      onWarning: warn,
      onPlan: (p) => sink.emit({ type: 'plan.compiled', criterion: p.criterion, persona: p.persona, status: p.status, cached: p.status !== 'uncompilable' && p.cached }),
    });
    signal?.throwIfAborted();
    await sink.flush();
    const plans: HauntingPlan[] = compiled.pairs.flatMap((p) => (p.status === 'compiled' ? [p.plan] : []));
    if (loaded.config.concurrency === 1 && plans.some((p) => p.actors.b)) {
      warn('concurrency 1: two-actor plans still open 2 contexts at once');
    }
    run = await runPlans(browser, loaded, plans, {
      ...opts.runOptions,
      sessions: scouted.sessions,
      outDir: runDir,
      reps,
      signal,
      onEvent: (e) => {
        if (e.type === 'reset.finished' && !e.ok) resetError ??= e.error;
        opts.onEvent?.(e);
      },
    });
    signal?.throwIfAborted();
  } finally {
    await browser.close().catch(() => undefined);
  }

  const verdicts = computeVerdicts(compiled.pairs, run);
  for (const p of verdicts.pairs) sink.emit({ type: 'verdict.pair', criterion: p.criterion, persona: p.persona, verdict: p.verdict, reason: p.reason });
  for (const c of verdicts.criteria) sink.emit({ type: 'verdict.criterion', criterion: c.criterion, verdict: c.verdict });
  await writeFile(join(runDir, 'verdicts.json'), json(verdicts));

  const rendered = renderReport({ specDir, criteria, compiled: compiled.pairs, verdicts, run: { runId, runDir, target, reps: run.reps, model, startedAt } });
  const reportPaths = await writeReport(specDir, rendered);

  const haunted = verdicts.criteria.filter((c) => c.verdict === 'haunted').map((c) => c.criterion);
  const allResetsFailed = run.resets.length > 0 && run.resets.every((r) => r === null);
  const finishedAt = Date.now();
  await writeFile(join(runDir, 'run.json'), json({ ...runJson, scoutHash: scouted.scoutHash, counts: verdicts.counts, finishedAt, durationMs: finishedAt - startedAt }));
  sink.emit({ type: 'run.finished', runId, counts: verdicts.counts, haunted, durationMs: finishedAt - startedAt });
  await sink.flush();

  return {
    runId, runDir, specDir, target, criteria, compiled: compiled.pairs, verdicts, haunted, allResetsFailed,
    ...(resetError !== undefined ? { resetError } : {}),
    reportPaths,
  };
}
