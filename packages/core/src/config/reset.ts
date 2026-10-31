import { spawn } from 'node:child_process';
import { ResetError } from './errors.js';
import type { LoadedConfig } from './load.js';

export type ResetResult = { durationMs: number; outputTail: string };

const MAX_OUTPUT_CHARS = 64 * 1024;
const TAIL_LINES = 20;
/** How long to wait for the pipes to close after `exit` before giving up on them (KI-19). */
const CLOSE_GRACE_MS = 100;

/** Redact first, then trim (D-29), so no part of a secret survives at the cut. */
function tail(output: string, redact: (s: string) => string): string {
  const kept = redact(output).slice(-MAX_OUTPUT_CHARS);
  return kept.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join('\n');
}

/**
 * Runs `resetCommand` through the shell in the config file's directory with the loader's env (Req 2.7, D-17).
 * Resolves on the child's `exit`, not when every pipe closes, so a command that leaves a background child
 * holding stdout doesn't time out (KI-19). On timeout the whole process group is killed. Failures are
 * `ResetError`s: system errors, never app bugs. `resetCommand` must not start long-lived servers.
 */
export function runReset(
  loaded: Pick<LoadedConfig, 'config' | 'configDir' | 'env' | 'redactor'>,
): Promise<ResetResult | null> {
  const command = loaded.config.resetCommand;
  if (command === undefined) return Promise.resolve(null);
  const timeoutMs = loaded.config.resetTimeoutMs;
  const redact = (s: string) => loaded.redactor.redact(s);
  const started = Date.now();

  return new Promise<ResetResult | null>((resolve, reject) => {
    let output = '';
    let settled = false;
    const child = spawn(command, {
      shell: true,
      cwd: loaded.configDir,
      env: loaded.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk: Buffer) => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.destroy();
      child.stderr.destroy();
      fn();
    };

    const timer = setTimeout(() => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The group is already gone.
      }
      settle(() =>
        reject(
          new ResetError('timeout', `resetCommand timed out after ${timeoutMs} ms`, {
            code: null,
            signal: 'SIGKILL',
            outputTail: tail(output, redact),
          }),
        ),
      );
    }, timeoutMs);

    child.on('error', (cause) => {
      settle(() =>
        reject(
          new ResetError('spawn', `resetCommand could not start: ${redact(cause.message)}`, {
            code: null,
            signal: null,
            outputTail: tail(output, redact),
          }, { cause }),
        ),
      );
    });

    child.on('exit', (code, signal) => {
      const finish = () =>
        settle(() => {
          const outputTail = tail(output, redact);
          if (code === 0) {
            resolve({ durationMs: Date.now() - started, outputTail });
            return;
          }
          const why = signal ? `was killed by ${signal}` : `exited with code ${code}`;
          reject(new ResetError('exit', `resetCommand ${why}`, { code, signal, outputTail }));
        });
      const grace = setTimeout(finish, CLOSE_GRACE_MS);
      child.once('close', () => {
        clearTimeout(grace);
        finish();
      });
    });
  });
}
