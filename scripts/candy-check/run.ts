import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ConfigError, loadConfig, parseSpec, runReset, type LoadedConfig } from '@poltergeist/core';
import { checkDeterminism, checkResetTiming, checkSpecShape, type Finding } from './check.js';

const exec = promisify(execFile);

export const BRIEF = 'docs/plans/2026-11-01-F10-kiro-brief.md';
const SPEC_SUBDIR = '.kiro/specs/candy-swap';
const PASSWORD_ENV = 'CANDY_SWAP_PASSWORD';
const PLACEHOLDER = 'candy-check-placeholder';
const RESETS = 2;
const DUMP_TIMEOUT_MS = 30_000;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** F10's Done-when against Kiro's Candy Swap in `fixtureDir` (D-37). Failures are findings, never throws. */
export async function runCandyCheck(opts: { fixtureDir: string; env?: NodeJS.ProcessEnv }): Promise<Finding[]> {
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
      findings.push({ level: 'fail', check: 'reset', message: message(e) });
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
      findings.push({ level: 'fail', check: 'dump', message: `npm run db:dump failed: ${message(e).split('\n')[0]}` });
      return findings;
    }
  }
  findings.push(checkResetTiming(durations), checkDeterminism(dumps));
  return findings;
}
