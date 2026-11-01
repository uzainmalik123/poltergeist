import { errors, type BrowserContext, type Locator, type Page } from 'playwright-core';
import { stepType, type PlanTarget, type Step } from '../compiler/dsl.js';
import type { LoadedConfig } from '../config/load.js';
import { generate } from '../personas/generators/index.js';
import { locateTarget, login } from '../scout/login.js';
import type { BarrierSet } from './barrier.js';
import type { Holds } from './holds.js';
import { moveCursor } from './overlay.js';
import { applyThrottle } from './throttle.js';
import type { ActorName, StepResult } from './types.js';

export type ActorEnv = {
  actor: ActorName;
  page: Page;
  context: BrowserContext;
  origin: string;
  loaded: Pick<LoadedConfig, 'config' | 'redactor'>;
  holds: Holds;
  barriers: BarrierSet;
  /** The pair's generator seed (the same every rep). */
  seed: number;
  stepTimeoutMs: number;
  onStep(r: StepResult, xy?: { x: number; y: number }): void;
};

export type ActorRun = {
  /** Each step is pushed when it starts and finalised when it ends, so a guard report can find it. */
  steps: StepResult[];
  end: 'done' | 'failed' | 'timeout' | 'broken';
  error?: string;
  loggedIn: boolean;
};

/** Grace on top of the step timeout before the runner stops waiting for Playwright to give up. */
const RACE_GRACE_MS = 250;

class StepTimeout extends Error {}
class StepFailure extends Error {}

const now = () => performance.timeOrigin + performance.now();
const firstLine = (s: string) => s.split('\n')[0]?.trim() ?? '';

const ACTIONS: ReadonlySet<string> = new Set(['goto', 'click', 'dblclick', 'fill', 'press', 'back', 'reload', 'login', 'logout']);

/**
 * The step a guard report belongs to: the latest started step that can send a request. Reports arrive
 * asynchronously, often after the click that caused them has finished and a `wait` has started.
 */
export function currentStep(run: ActorRun): StepResult | undefined {
  return run.steps.findLast((s) => ACTIONS.has(s.type)) ?? run.steps.at(-1);
}

/**
 * Runs one actor's steps in order (Req 6, D-33) and stops at the first step that isn't `ok`. Actions time
 * out after `stepTimeoutMs`. Barrier waits have no step timeout; the plan timeout bounds them. The actor
 * always leaves its barriers and releases its held requests when it ends.
 */
export function startActor(steps: readonly Step[], env: ActorEnv): { run: ActorRun; done: Promise<ActorRun> } {
  const run: ActorRun = { steps: [], end: 'done', loggedIn: false };
  const { page, context, stepTimeoutMs } = env;
  context.setDefaultTimeout(stepTimeoutMs);
  context.setDefaultNavigationTimeout(stepTimeoutMs);
  let fills = 0;

  const resolveTarget = async (t: PlanTarget, result: StepResult): Promise<{ loc: Locator; xy?: { x: number; y: number } }> => {
    const all = locateTarget(page, t);
    const n = await all.count();
    if (n > 1) result.note = `${n} matches, used the first`;
    const loc = all.first();
    const box = await loc.boundingBox({ timeout: stepTimeoutMs }).catch(() => null);
    if (!box) return { loc };
    const xy = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    await moveCursor(page, xy.x, xy.y);
    return { loc, xy };
  };

  const exec = async (step: Step, result: StepResult): Promise<{ x: number; y: number } | undefined> => {
    const url = (path: string) => new URL(path, env.origin).href;
    if ('goto' in step) await page.goto(url(step.goto), { waitUntil: 'load' });
    else if ('click' in step) {
      const { loc, xy } = await resolveTarget(step.click, result);
      await loc.click();
      return xy;
    } else if ('dblclick' in step) {
      const { loc, xy } = await resolveTarget(step.dblclick, result);
      await loc.dblclick();
      return xy;
    } else if ('fill' in step) {
      const { loc, xy } = await resolveTarget(step.fill.target, result);
      await loc.fill(generate(step.fill.input.generator, env.seed, fills++));
      return xy;
    } else if ('press' in step) await page.keyboard.press(step.press);
    else if ('back' in step) await page.goBack({ waitUntil: 'load' });
    else if ('reload' in step) await page.reload({ waitUntil: 'load' });
    else if ('wait' in step) await page.waitForTimeout(step.wait);
    else if ('throttle' in step) await applyThrottle(page, step.throttle.profile);
    else if ('holdRequests' in step) env.holds.hold(step.holdRequests);
    else if ('releaseRequests' in step) env.holds.release(step.releaseRequests);
    else if ('login' in step) {
      const account = env.loaded.config.accounts?.[step.login.account];
      if (!account) throw new StepFailure(`unknown account "${step.login.account}"`);
      const r = await login(page, account, { origin: env.origin, deadline: Date.now() + stepTimeoutMs, redactor: env.loaded.redactor });
      run.loggedIn = true;
      if (!r.ok) throw new StepFailure(r.reason);
    } else if ('logout' in step) {
      await context.clearCookies();
      await page.evaluate('try { localStorage.clear(); sessionStorage.clear(); } catch {}').catch(() => undefined);
    }
    return undefined;
  };

  const raced = <T>(p: Promise<T>): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StepTimeout(`step exceeded ${stepTimeoutMs} ms`)), stepTimeoutMs + RACE_GRACE_MS);
    });
    p.catch(() => undefined); // it may settle after the race is lost
    return Promise.race([p, limit]).finally(() => clearTimeout(timer));
  };

  const done = (async () => {
    try {
      for (const [index, step] of steps.entries()) {
        const result: StepResult = { actor: env.actor, index, type: stepType(step), outcome: 'ok', startedAt: now(), durationMs: 0 };
        run.steps.push(result);
        const t = performance.now();
        let xy: { x: number; y: number } | undefined;
        try {
          if ('barrier' in step) {
            if ((await env.barriers.arrive(step.barrier, env.actor)) === 'broken') {
              result.outcome = 'failed';
              result.error = `barrier "${step.barrier}" broken: another actor ended first`;
              run.end = 'broken';
            }
          } else xy = await raced(exec(step, result));
        } catch (err) {
          const timeout = err instanceof StepTimeout || err instanceof errors.TimeoutError;
          result.outcome = timeout ? 'timeout' : 'failed';
          result.error = env.loaded.redactor.redact(firstLine(err instanceof Error ? err.message : String(err)));
          run.end = timeout ? 'timeout' : 'failed';
        }
        // A guard report may already have marked the step `blocked-by-rule`; keep that.
        result.durationMs = Math.round(performance.now() - t);
        env.onStep(result, xy);
        if (run.end !== 'done') {
          run.error = result.error;
          break;
        }
      }
    } finally {
      env.barriers.leave(env.actor);
      env.holds.releaseAll();
    }
    return run;
  })();

  return { run, done };
}

export async function runActor(steps: readonly Step[], env: ActorEnv): Promise<ActorRun> {
  return startActor(steps, env).done;
}
