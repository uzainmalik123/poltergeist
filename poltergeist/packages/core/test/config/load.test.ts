import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config/errors.js';
import { loadConfig } from '../../src/config/load.js';

const account = { loginRoute: '/login', username: 'ghost1', password: 'env:POLTERGEIST_PW' };
const base = {
  target: 'http://localhost:4000',
  routes: [{ path: '/', auth: false }, { path: '/market', auth: true }],
  accounts: { default: account },
};
const env = { POLTERGEIST_PW: 'hunter22' };

async function writeConfig(config: unknown, name = 'poltergeist.config.json'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pg-config-'));
  await writeFile(join(dir, name), typeof config === 'string' ? config : JSON.stringify(config));
  return dir;
}

async function loadError(config: unknown, e: NodeJS.ProcessEnv = env): Promise<ConfigError> {
  const dir = await writeConfig(config);
  const err = await loadConfig({ cwd: dir, env: e }).catch((x: unknown) => x);
  expect(err).toBeInstanceOf(ConfigError);
  return err as ConfigError;
}

describe('loadConfig', () => {
  it('resolves env secrets, keeps the raw snapshot and builds the redactor', async () => {
    const dir = await writeConfig(base);
    const loaded = await loadConfig({ cwd: dir, env });
    expect(loaded.config.accounts.default?.password).toBe('hunter22');
    expect((loaded.snapshot as typeof base).accounts.default.password).toBe('env:POLTERGEIST_PW');
    expect(loaded.redactor.redact('hunter22')).toBe('[REDACTED]');
    expect(loaded.configDir).toBe(dir);
    expect(loaded.configPath).toBe(join(dir, 'poltergeist.config.json'));
    expect(loaded.allowedHosts.slice(0, 3)).toEqual(['localhost', '127.0.0.1', '::1']);
    expect(loaded.env).toBe(env);
    expect(loaded.warnings).toEqual([]);
  });

  it('refuses a non-allowlisted target (Done-when)', async () => {
    const err = await loadError({ ...base, target: 'https://example.com' });
    expect(err.exitCode).toBe(2);
    expect(err.issues).toHaveLength(1);
    expect(err.issues[0]?.path).toBe('target');
    expect(err.issues[0]?.message).toContain('example.com');
    expect(err.issues[0]?.message).toContain('allowedHosts');
  });

  it('accepts a target listed in allowedHosts', async () => {
    const dir = await writeConfig({ ...base, target: 'http://api.test:8080', allowedHosts: ['api.test'] });
    const loaded = await loadConfig({ cwd: dir, env });
    expect(loaded.allowedHosts).toContain('api.test');
  });

  it('refuses a trailing-dot target', async () => {
    const err = await loadError({ ...base, target: 'http://localhost.:4000' });
    expect(err.issues.map((i) => i.path)).toEqual(['target']);
  });

  it('rejects concurrency 25 (Done-when)', async () => {
    const err = await loadError({ ...base, concurrency: 25 });
    expect(err.issues.map((i) => i.path)).toContain('concurrency');
  });

  it.each([{}, { POLTERGEIST_PW: '' }])('fails on an unresolved secret of a route-used account (%j)', async (e) => {
    const err = await loadError(base, e);
    expect(err.issues.map((i) => i.path)).toEqual(['accounts.default.password']);
    expect(err.issues[0]?.message).toContain('POLTERGEIST_PW');
  });

  it('drops an unused account whose secret is unset, with a warning (KI-20)', async () => {
    const dir = await writeConfig({ ...base, accounts: { ...base.accounts, spare: { ...account, password: 'env:SPARE_PW' } } });
    const loaded = await loadConfig({ cwd: dir, env });
    expect(loaded.config.accounts.spare).toBeUndefined();
    expect(loaded.warnings).toEqual([
      expect.objectContaining({ code: 'unresolved-secret', path: 'accounts.spare.password' }),
    ]);
  });

  it('warns about a literal password', async () => {
    const dir = await writeConfig({ ...base, accounts: { default: { ...account, password: 'candy' } } });
    const loaded = await loadConfig({ cwd: dir, env });
    expect(loaded.config.accounts.default?.password).toBe('candy');
    expect(loaded.redactor.redact('candy')).toBe('[REDACTED]');
    expect(loaded.warnings).toEqual([
      expect.objectContaining({ code: 'literal-password', path: 'accounts.default.password' }),
    ]);
  });

  it('redacts secrets in issue paths and messages', async () => {
    const err = await loadError({ ...base, accounts: { ...base.accounts, hunter22: { ...account, extra: 1 } } });
    expect(err.issues.length).toBeGreaterThan(0);
    for (const issue of err.issues) {
      expect(issue.path).not.toContain('hunter22');
      expect(issue.message).not.toContain('hunter22');
    }
    expect(err.message).not.toContain('hunter22');
  });

  it('reports a missing file as a ConfigError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-config-'));
    const err = await loadConfig({ cwd: dir, env }).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain('cannot read');
  });

  it('reports invalid JSON as a ConfigError', async () => {
    const err = await loadError('{nope');
    expect(err.message).toContain('invalid JSON');
  });

  it('never echoes source text in a JSON error', async () => {
    const err = await loadError('{"accounts":{"a":{"password":hunter2secretvalue}}}');
    expect(err.message).toContain('invalid JSON');
    expect(err.message).not.toMatch(/hunter|secret|password/);
  });

  it('redacts literal passwords in the snapshot and leaves env references', async () => {
    const raw = { ...base, accounts: { ...base.accounts, spare: { ...account, password: 'candy' } } };
    const dir = await writeConfig(raw);
    const loaded = await loadConfig({ cwd: dir, env });
    const snap = loaded.snapshot as typeof raw;
    expect(snap.accounts.spare.password).toBe('[REDACTED]');
    expect(snap.accounts.default.password).toBe('env:POLTERGEIST_PW');
    expect(JSON.stringify(snap)).not.toContain('candy');
  });

  it('resolves a relative --config path against cwd and uses its directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-config-'));
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'x.json'), JSON.stringify(base));
    const loaded = await loadConfig({ path: 'sub/x.json', cwd: dir, env });
    expect(loaded.configDir).toBe(join(dir, 'sub'));
  });
});
