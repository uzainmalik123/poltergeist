import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ResetError } from '../../src/config/errors.js';
import { Redactor } from '../../src/config/redact.js';
import { runReset } from '../../src/config/reset.js';
import { ConfigSchema } from '../../src/config/schema.js';

const node = JSON.stringify(process.execPath);

async function loaded(resetCommand: string | undefined, opts: { resetTimeoutMs?: number; env?: NodeJS.ProcessEnv; secrets?: string[]; configDir?: string } = {}) {
  const config = ConfigSchema.parse({
    target: 'http://localhost:4000',
    routes: [{ path: '/', auth: false }],
    ...(resetCommand === undefined ? {} : { resetCommand }),
    ...(opts.resetTimeoutMs === undefined ? {} : { resetTimeoutMs: opts.resetTimeoutMs }),
  });
  return {
    config,
    configDir: opts.configDir ?? (await mkdtemp(join(tmpdir(), 'pg-reset-'))),
    env: opts.env ?? process.env,
    redactor: new Redactor(opts.secrets ?? []),
  };
}

const js = (code: string) => `${node} -e ${JSON.stringify(code)}`;

describe('runReset', () => {
  it('returns null without a resetCommand', async () => {
    expect(await runReset(await loaded(undefined))).toBeNull();
  });

  it("runs in the config file's directory", async () => {
    const l = await loaded(js('process.stdout.write(process.cwd())'));
    const result = await runReset(l);
    expect(await realpath(result?.outputTail ?? '')).toBe(await realpath(l.configDir));
    expect(result?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes the loader's env and redacts secrets from the output", async () => {
    const l = await loaded(js("process.stdout.write('pw='+process.env.POLTERGEIST_PW)"), {
      env: { ...process.env, POLTERGEIST_PW: 'hunter22' },
      secrets: ['hunter22'],
    });
    expect((await runReset(l))?.outputTail).toBe('pw=[REDACTED]');
  });

  it('redacts a secret split across stdout and stderr', async () => {
    const l = await loaded(js("process.stdout.write('hun');setTimeout(()=>process.stderr.write('ter22'),20)"), { secrets: ['hunter22'] });
    const out = (await runReset(l))?.outputTail ?? '';
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('ter22');
  });

  it('keeps the last 20 lines', async () => {
    const l = await loaded(js("let s='x'.repeat(70000)+'\\n';for(let i=0;i<25;i++)s+='L'+i+'\\n';process.stdout.write(s)"));
    const lines = Array.from({ length: 20 }, (_, i) => `L${i + 5}`);
    expect((await runReset(l))?.outputTail).toBe(lines.join('\n'));
  });

  it('redacts before trimming to 64 KB', async () => {
    const secret = 'S3CRETVALUE';
    // The secret straddles the 64 KB cut: if trimmed first, its tail would survive unredacted.
    const l = await loaded(js(`process.stdout.write('${secret}'+'y'.repeat(65530))`), { secrets: [secret] });
    const err = await runReset(l).then(
      (r) => r?.outputTail ?? '',
      (e: unknown) => String(e),
    );
    expect(err).not.toMatch(/ETVALUE|CRETVAL/);
  });

  it('fails on a non-zero exit', async () => {
    const err = await runReset(await loaded(js("console.error('nope');process.exit(3)"))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResetError);
    expect(err).toMatchObject({ kind: 'exit', code: 3, exitCode: 2, outputTail: 'nope' });
  });

  it('times out and kills the process group', async () => {
    const started = Date.now();
    const err = await runReset(await loaded(js('setTimeout(()=>{},10000)'), { resetTimeoutMs: 1000 })).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'timeout' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('resolves when the command exits even if a background child keeps the pipes open (KI-19)', async () => {
    // The KI-19 shape: a shell job left running in the background (e.g. `npm run dev &`) inherits the pipes.
    const started = Date.now();
    const result = await runReset(await loaded(`${js('setTimeout(()=>{},5000)')} & echo ok`, { resetTimeoutMs: 4000 }));
    expect(result?.outputTail).toBe('ok');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('reports a spawn failure', async () => {
    const err = await runReset(await loaded('true', { configDir: '/nonexistent-poltergeist' })).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'spawn' });
  });
});
