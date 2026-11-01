import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getPersona, PERSONA_IDS, type Persona, type PersonaId } from '../personas/registry.js';
import { createLimiter } from '../safety/limiter.js';
import type { RouteScout } from '../scout/types.js';
import type { Criterion } from '../spec/types.js';
import { cacheKey, personaHash, readCache, writeCache, type CachedResult } from './cache.js';
import { LlmOutputSchema, type HauntingPlan, type PlanRoute } from './dsl.js';
import { CompilerError } from './errors.js';
import type { LlmClient, LlmTurn } from './llm.js';
import { buildRetryPrompt, buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt.js';
import { pickRoutes } from './routes.js';
import { validatePlan } from './validate.js';

/** At most four LLM calls at once (PRD F05). */
export const MAX_LLM_CONCURRENCY = 4;
const MAX_REASON = 300;

export type CompileOptions = {
  client: LlmClient;
  model: string;
  cacheDir: string;
  /** When set, every pair is written to `<outDir>/plans/<criterion>__<persona>.json`. */
  outDir?: string;
  /** Defaults to every built-in persona. */
  personas?: readonly string[];
  /** 1…4, default 4. */
  concurrency?: number;
  onPlan?: (result: PairResult) => void;
  /** Skip cache reads (`--recompile`); results are still written to the cache. */
  recompile?: boolean;
  /** A failed cache or plan-file write is reported here and never rejects `compile()` (KI-35). */
  onWarning?: (message: string) => void;
};

type Attempts = 0 | 1 | 2;

export type PairResult =
  | { status: 'compiled'; criterion: string; persona: PersonaId; plan: HauntingPlan; cached: boolean; attempts: Attempts }
  | { status: 'notApplicable'; criterion: string; persona: PersonaId; reason: string; routes: PlanRoute[]; cached: boolean; attempts: Attempts }
  | { status: 'uncompilable'; criterion: string; persona: PersonaId; reason: string; errors: string[]; attempts: Attempts };

export type CompileResult = { pairs: PairResult[]; llmCalls: number; cacheHits: number };

type Checked = { ok: CachedResult } | { errors: string[] };

function check(text: string, stopReason: string | null, criterion: Criterion, persona: Persona, routes: RouteScout[]): Checked {
  let json: unknown;
  try {
    if (stopReason === 'max_tokens') throw new Error('truncated');
    json = JSON.parse(text);
  } catch {
    return { errors: [`output was not valid JSON (stop reason: ${stopReason ?? 'none'})`] };
  }
  const parsed = LlmOutputSchema.safeParse(json);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const planRoutes = routes.map(({ path, identity }) => ({ path, identity }));
  const result = parsed.data.result;
  if (result.kind === 'notApplicable') {
    const reason = result.reason.trim();
    if (!reason) return { errors: ['result.reason: must not be empty'] };
    if (reason.length > MAX_REASON) return { errors: [`result.reason: must be at most ${MAX_REASON} characters`] };
    return { ok: { kind: 'notApplicable', reason, routes: planRoutes } };
  }
  const errors = validatePlan(result, { persona, routes });
  if (errors.length) return { errors };
  const { intent, actors, assert } = result;
  return { ok: { kind: 'plan', plan: { criterion: criterion.id, persona: persona.id, intent, routes: planRoutes, actors, assert } } };
}

/** Re-stamps the ids: the cache key covers criterion text, not its id, so a renumbered criterion hits. */
function fromCached(criterion: string, persona: PersonaId, c: CachedResult, cached: boolean, attempts: Attempts): PairResult {
  return c.kind === 'plan'
    ? { status: 'compiled', criterion, persona, plan: { ...c.plan, criterion, persona }, cached, attempts }
    : { status: 'notApplicable', criterion, persona, reason: c.reason, routes: c.routes, cached, attempts };
}

/**
 * Turns every criterion × persona pair into a validated plan, a justified `notApplicable`, or an
 * `uncompilable` with reasons (Requirement 5, D-32). Cache hits make no LLM call.
 */
export async function compile(
  criteria: readonly Criterion[],
  scout: { routes: readonly RouteScout[] },
  opts: CompileOptions,
): Promise<CompileResult> {
  const concurrency = opts.concurrency ?? MAX_LLM_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_LLM_CONCURRENCY) {
    throw new RangeError(`concurrency must be an integer 1…${MAX_LLM_CONCURRENCY}, got ${concurrency}`);
  }
  const ids = opts.personas ?? PERSONA_IDS;
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup !== undefined) throw new RangeError(`duplicate persona id: ${dup}`);
  const personas = ids.map((id) => getPersona(id));
  const warn = (message: string) => {
    try {
      opts.onWarning?.(message);
    } catch {
      // A broken listener must not lose paid results.
    }
  };
  const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const hashes = new Map(personas.map((p) => [p.id, personaHash(p)]));
  const limit = createLimiter(concurrency);
  let llmCalls = 0;
  let cacheHits = 0;
  /** Set on the first CompilerError: queued pairs stop before calling, writing or reporting. */
  let aborted = false;
  const stopIfAborted = () => {
    if (aborted) throw new CompilerError('Compile aborted after an earlier error.');
  };

  const compilePair = async (criterion: Criterion, persona: Persona): Promise<PairResult> => {
    const base = { criterion: criterion.id, persona: persona.id };
    const routes = pickRoutes(criterion, scout.routes);
    if (routes.length === 0) return { status: 'uncompilable', ...base, reason: 'no matching route', errors: [], attempts: 0 };

    const key = cacheKey({
      criterionHash: criterion.hash,
      personaId: persona.id,
      personaHash: hashes.get(persona.id)!,
      routes: routes.map(({ path, identity, routeHash }) => ({ path, identity, routeHash })),
      model: opts.model,
      promptVersion: PROMPT_VERSION,
    });
    const hit = opts.recompile ? undefined : await readCache(opts.cacheDir, key);
    if (hit) {
      cacheHits++;
      return fromCached(criterion.id, persona.id, hit, true, 0);
    }

    const turns: LlmTurn[] = [{ role: 'user', text: buildUserPrompt(criterion, persona, routes) }];
    let errors: string[] = [];
    for (const attempt of [1, 2] as const) {
      let response;
      try {
        response = await limit(() => {
          stopIfAborted();
          llmCalls++;
          return opts.client.complete({ model: opts.model, system: SYSTEM_PROMPT, turns: [...turns], meta: { ...base, attempt } });
        });
      } catch (err) {
        if (err instanceof CompilerError) {
          aborted = true;
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'uncompilable', ...base, reason: `llm error: ${message}`, errors: [], attempts: attempt };
      }
      if (response.kind === 'refusal') {
        return { status: 'uncompilable', ...base, reason: `refused: ${response.detail}`, errors: [], attempts: attempt };
      }
      stopIfAborted();
      const checked = check(response.text, response.stopReason, criterion, persona, routes);
      if ('ok' in checked) {
        await writeCache(opts.cacheDir, key, checked.ok).catch((err: unknown) => warn(`cache write failed: ${errText(err)}`));
        return fromCached(criterion.id, persona.id, checked.ok, false, attempt);
      }
      errors = checked.errors;
      turns.push({ role: 'assistant', raw: response.raw }, { role: 'user', text: buildRetryPrompt(errors) });
    }
    return { status: 'uncompilable', ...base, reason: 'invalid plan after retry', errors, attempts: 2 };
  };

  let plansDir = opts.outDir === undefined ? undefined : join(opts.outDir, 'plans');
  if (plansDir) {
    const dir = plansDir;
    await mkdir(dir, { recursive: true }).catch((err: unknown) => {
      warn(`plan write failed: ${dir}: ${errText(err)}`);
      plansDir = undefined;
    });
  }

  const pairs = await Promise.all(
    criteria.flatMap((criterion) =>
      personas.map(async (persona) => {
        const result = await compilePair(criterion, persona);
        stopIfAborted();
        if (plansDir) {
          const file = join(plansDir, `${result.criterion}__${result.persona}.json`);
          await writeFile(file, JSON.stringify(result, null, 2) + '\n').catch((err: unknown) => warn(`plan write failed: ${file}: ${errText(err)}`));
        }
        opts.onPlan?.(result);
        return result;
      }),
    ),
  );
  return { pairs, llmCalls, cacheHits };
}
