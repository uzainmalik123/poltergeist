import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ConfigError, loadConfig, parseSpec, ResetError, runReset, type LoadedConfig } from '@poltergeist/core';
import { checkDeterminism, checkResetTiming, checkSpecShape, RESET_BUDGET_MS, type Finding } from './check.js';

const exec = promisify(execFile);

export const BRIEF = 'docs/plans/2026-11-01-F10-kiro-brief.md';
const SPEC_SUBDIR = '.kiro/specs/candy-swap';
const PASSWORD_ENV = 'CANDY_SWAP_PASSWORD';
const PLACEHOLDER = 'candy-check-placeholder';
const RESETS = 2;
const DUMP_TIMEOUT_MS = 30_000;

const TAIL_LINES = 20;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const tail = (text: string): string => text.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join('\n');

/** A failed `npm run` from `execFile`: its first line plus the tail of what the script printed. */
function execFailure(e: unknown): string {
  const { stderr, stdout } = e as { stderr?: string; stdout?: string };
  const output = tail(stderr || stdout || '');
  return output ? `${message(e).split('\n')[0]}\n${output}` : message(e).split('\n')[0]!;
}

/** F10's Done-when against Kiro's Candy Swap in `fixtureDir` (D-37). Failures are findings, never throws. */
export async function runCandyCheck(opts: {
  fixtureDir: string;
  env?: NodeJS.ProcessEnv;
  /** Override `RESET_BUDGET_MS`; tests use a large value so a slow runner can't flake them. */
  resetBudgetMs?: number;
}): Promise<Finding[]> {
  const { fixtureDir } = opts;
  const env = { ...(opts.env ?? process.env) };
  const specDir = join(fixtureDir, SPEC_SUBDIR);
  if (!existsSync(join(specDir, 'requirements.md'))) {
    return [{ level: 'fail', check: 'built', message: `Candy Swap is not built yet (KI-44): build it in Kiro from ${BRIEF}` }];
  }

  const findings: Finding[] = checkSpecShape(await parseSpec(specDir));

  if (!env[PASSWORD_ENV]) {
    findings.push({
      level: 'warn',
      check: 'password-env',
      message: `${PASSWORD_ENV} is not set; checked the config with a placeholder (set it before summoning)`,
    });
    env[PASSWORD_ENV] = PLACEHOLDER;
  }
  let loaded: LoadedConfig;
  try {
    loaded = await loadConfig({ path: 'poltergeist.config.json', cwd: fixtureDir, env });
    findings.push({ level: 'ok', check: 'config', message: 'poltergeist.config.json loads' });
  } catch (e) {
    const detail = e instanceof ConfigError ? e.issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ') : message(e);
    findings.push({ level: 'fail', check: 'config', message: detail });
    return findings;
  }

  const durations: number[] = [];
  const dumps: string[] = [];
  for (let i = 0; i < RESETS; i++) {
    try {
      const result = await runReset(loaded);
      if (result === null) {
        findings.push({ level: 'fail', check: 'reset', message: 'poltergeist.config.json has no resetCommand' });
        return findings;
      }
      durations.push(result.durationMs);
    } catch (e) {
      const output = e instanceof ResetError && e.outputTail ? `\n${e.outputTail}` : '';
      findings.push({ level: 'fail', check: 'reset', message: `${message(e)}${output}` });
      return findings;
    }
    try {
      const { stdout } = await exec('npm', ['run', '--silent', 'db:dump'], {
        cwd: fixtureDir,
        env: loaded.env,
        timeout: DUMP_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      });
      dumps.push(stdout);
    } catch (e) {
      findings.push({ level: 'fail', check: 'dump', message: `npm run db:dump failed: ${execFailure(e)}` });
      return findings;
    }
  }
  findings.push(checkResetTiming(durations, opts.resetBudgetMs ?? RESET_BUDGET_MS), checkDeterminism(dumps));
  return findings;
}
