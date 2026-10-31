import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../../src/config/schema.js';
import { ConfigError, ResetError } from '../../src/config/errors.js';

const base = { target: 'http://localhost:4000', routes: [{ path: '/', auth: false }] };
const account = { loginRoute: '/login', username: 'ghost1', password: 'pw' };

function issuePaths(input: unknown): string[] {
  const r = ConfigSchema.safeParse(input);
  if (r.success) return [];
  return r.error.issues.map((i) => i.path.join('.'));
}

describe('ConfigSchema', () => {
  it('applies the defaults', () => {
    expect(ConfigSchema.parse(base)).toEqual({
      ...base,
      allowedHosts: [],
      accounts: {},
      resetTimeoutMs: 60000,
      concurrency: 12,
      reps: 3,
      forbidden: [],
      model: 'claude-sonnet-5-5',
    });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['concurrency 25', { concurrency: 25 }, 'concurrency'],
    ['concurrency 0', { concurrency: 0 }, 'concurrency'],
    ['concurrency 1.5', { concurrency: 1.5 }, 'concurrency'],
    ['reps 11', { reps: 11 }, 'reps'],
    ['reps 0', { reps: 0 }, 'reps'],
    ['resetTimeoutMs 999', { resetTimeoutMs: 999 }, 'resetTimeoutMs'],
    ['resetTimeoutMs 600001', { resetTimeoutMs: 600001 }, 'resetTimeoutMs'],
    ['blank resetCommand', { resetCommand: '  ' }, 'resetCommand'],
    ['target with a path', { target: 'http://localhost:4000/app' }, 'target'],
    ['target with a query', { target: 'http://localhost:4000/?a=1' }, 'target'],
    ['target with a hash', { target: 'http://localhost:4000/#x' }, 'target'],
    ['ftp target', { target: 'ftp://localhost' }, 'target'],
    ['malformed target', { target: 'not a url' }, 'target'],
    ['userinfo target', { target: 'http://u:p@localhost:4000' }, 'target'],
    ['userinfo-spoofed target', { target: 'http://localhost@evil.com' }, 'target'],
    ['unknown root key', { colour: 'green' }, ''],
    ['unknown route key', { routes: [{ path: '/', auth: false, extra: 1 }] }, 'routes.0'],
    ['unknown account key', { accounts: { default: { ...account, extra: 1 } } }, 'accounts.default'],
    ['unknown forbidden key', { forbidden: [{ method: 'GET', path: '/x', extra: 1 }] }, 'forbidden.0'],
    [
      'unknown target key',
      { accounts: { default: { ...account, fields: { username: { label: 'x', extra: 1 } } } } },
      'accounts.default.fields.username',
    ],
    ['bare * host', { allowedHosts: ['*'] }, 'allowedHosts.0'],
    ['auth true with no accounts', { routes: [{ path: '/m', auth: true }] }, 'routes.0.auth'],
    ['auth naming a missing account', { routes: [{ path: '/m', auth: 'admin' }], accounts: { default: account } }, 'routes.0.auth'],
    ['method with a space', { forbidden: [{ method: 'DE LETE', path: '/x' }] }, 'forbidden.0.method'],
    ['route path without a slash', { routes: [{ path: 'market', auth: false }] }, 'routes.0.path'],
  ])('rejects %s', (_name, patch, path) => {
    expect(issuePaths({ ...base, ...patch })).toContain(path);
  });

  it.each<[string, Record<string, unknown>]>([
    ['origin with a trailing slash', { target: 'http://localhost:4000/' }],
    ['concurrency 20', { concurrency: 20 }],
    ['concurrency 1', { concurrency: 1 }],
    ['reps 10', { reps: 10 }],
    ['lower-case forbidden method', { forbidden: [{ method: 'delete', path: '/api/*' }] }],
    ['wildcard method', { forbidden: [{ method: '*', path: '/api/*' }] }],
    ['host entries', { allowedHosts: ['api.test', '*.cdn.test', '10.0.0.1', '::1'] }],
    ['login field overrides', { accounts: { default: { ...account, fields: { submit: { role: 'button', name: 'Go' } } } } }],
    ['auth true with a default account', { routes: [{ path: '/m', auth: true }], accounts: { default: account } }],
  ])('accepts %s', (_name, patch) => {
    expect(issuePaths({ ...base, ...patch })).toEqual([]);
  });
});

describe('errors', () => {
  it('ConfigError carries exit code 2 and its issues', () => {
    const e = new ConfigError([{ path: 'target', message: 'bad' }]);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ConfigError');
    expect(e.exitCode).toBe(2);
    expect(e.issues).toEqual([{ path: 'target', message: 'bad' }]);
    expect(e.message).toContain('target: bad');
  });

  it('ResetError carries exit code 2, kind and output tail', () => {
    const e = new ResetError('timeout', 'reset timed out', { code: null, signal: 'SIGKILL', outputTail: 'x' });
    expect(e.name).toBe('ResetError');
    expect(e.exitCode).toBe(2);
    expect(e.kind).toBe('timeout');
    expect(e.signal).toBe('SIGKILL');
    expect(e.outputTail).toBe('x');
  });
});
