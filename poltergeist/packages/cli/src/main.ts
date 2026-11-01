import process from 'node:process';
import { newRunId, summon, UsageError, type PersonaId, type SummonEvent, type SummonOptions } from '@poltergeist/core';
import { HELP_TEXT, parseCliArgs } from './args.js';
import { exitCodeFor } from './exit.js';
import { SEANCE_EVENT_PORT, startEventServer, type EventServer } from './seance-server.js';
import { renderBoard, renderHeader } from './term/board.js';
import { colorEnabled, paint, termSafe } from './term/color.js';
import { ghostLine, LiveBlock } from './term/live.js';

type Out = { write(s: string): void; isTTY?: boolean; columns?: number };

export type MainDeps = {
  stdout?: Out;
  stderr?: { write(s: string): void };
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  summonOverrides?: Pick<SummonOptions, 'llm' | 'launch' | 'runOptions'>;
  /** Default: aborted on the first SIGINT. */
  signal?: AbortSignal;
  /** Tests only. */
  seancePort?: number;
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const LIVE_LINES = 12;

/** `poltergeist <argv>`: returns the exit code (Req 9, D-36). */
export async function main(argv: readonly string[], deps: MainDeps = {}): Promise<number> {
  const stdout: Out = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const env = deps.env ?? process.env;
  const cwd = deps.cwd ?? process.cwd();
  const color = colorEnabled(stdout, env);
  const width = Math.max(40, stdout.columns ?? 100);
  const fail = (text: string) => stderr.write(`${paint('error:', 'haunted', colorEnabled(stderr as Out, env))} ${text}\n`);

  let args;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    fail(message(err));
    stderr.write('run "poltergeist --help" for usage\n');
    return 2;
  }
  if (args.command === 'help') {
    stdout.write(HELP_TEXT);
    return 0;
  }

  let signal = deps.signal;
  let onSigint: (() => void) | undefined;
  if (!signal) {
    const ac = new AbortController();
    onSigint = () => {
      stderr.write('aborting…\n');
      ac.abort(new DOMException('interrupted', 'AbortError'));
    };
    process.once('SIGINT', onSigint);
    signal = ac.signal;
  }

  const runId = newRunId();
  let server: EventServer | undefined;
  const live = color ? new LiveBlock(stdout, LIVE_LINES) : undefined;
  const say = (line: string) => (live ? live.log(line) : stdout.write(`${line}\n`));
  try {
    if (args.seance) {
      server = await startEventServer(runId, { port: deps.seancePort ?? SEANCE_EVENT_PORT });
      stdout.write(`${paint('séance:', 'ecto', color)} ${server.url}\n`);
    }

    const ghosts = new Map<string, { persona: PersonaId; criterion: string; rep: number }>();
    const plans = { compiled: 0, cached: 0, notApplicable: 0, uncompilable: 0 };
    let reps = 0;
    let announced = false;
    const onEvent = (e: SummonEvent) => {
      server?.publish(e);
      switch (e.type) {
        case 'run.started':
          reps = e.reps;
          stdout.write(renderHeader({ specDir: e.specDir, target: e.target, criteria: e.criteria.length, personas: e.personas.length, reps: e.reps }, color));
          say('scouting routes…');
          break;
        case 'scout.route':
          say(`  ${termSafe(e.path, 60)} as ${termSafe(e.identity, 30)}: ${e.status}`);
          break;
        case 'plan.compiled':
          if (e.status === 'compiled') plans.compiled++;
          else plans[e.status]++;
          if (e.status !== 'uncompilable' && e.cached) plans.cached++;
          break;
        case 'rep.started':
          if (!announced) {
            announced = true;
            say(`compiled ${plans.compiled} plans (${plans.cached} cached, ${plans.notApplicable} n/a, ${plans.uncompilable} uncompilable)`);
          }
          say(`rep ${e.rep}/${reps}: summoning…`);
          break;
        case 'reset.finished':
          if (!e.ok) stderr.write(`warning: ${termSafe(e.error ?? 'reset failed', 200)}\n`);
          break;
        case 'ghost.spawned':
          ghosts.set(e.ghostId, { persona: e.persona, criterion: e.criterion, rep: e.rep });
          live?.update(e.ghostId, ghostLine({ persona: e.persona, criterion: e.criterion, rep: e.rep }, color));
          break;
        case 'ghost.step': {
          const g = ghosts.get(e.ghostId);
          if (g) live?.update(e.ghostId, ghostLine({ ...g, step: e.step }, color));
          break;
        }
        case 'rep.finished':
          for (const [id, g] of ghosts) {
            if (g.rep !== e.rep) continue;
            ghosts.delete(id);
            live?.remove(id);
          }
          say(`rep ${e.rep}/${reps} done: ${Object.entries(e.outcomes).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing ran'}`);
          break;
      }
    };

    const result = await summon({
      specDir: args.spec,
      configPath: args.config,
      cwd,
      env,
      only: args.only,
      personas: args.personas,
      reps: args.reps,
      recompile: args.recompile,
      runId,
      signal,
      onEvent,
      onWarning: (w) => stderr.write(`warning: ${termSafe(w, 300)}\n`),
      ...deps.summonOverrides,
    });
    live?.clear();
    stdout.write(`\n${renderBoard(result, { color, width, cwd })}`);
    if (result.allResetsFailed) fail(`every reset failed: ${termSafe(result.resetError ?? 'unknown error', 300)}`);
    return exitCodeFor({ result });
  } catch (err) {
    live?.clear();
    const aborted = signal.aborted;
    if (!aborted) {
      fail(termSafe(message(err), 2000));
      if (/Executable doesn't exist/.test(message(err))) stderr.write('run: npx playwright-core install chromium\n');
      if (err instanceof UsageError) stderr.write('run "poltergeist --help" for usage\n');
    }
    return exitCodeFor({ error: err, aborted });
  } finally {
    if (onSigint) process.removeListener('SIGINT', onSigint);
    await server?.close();
  }
}
