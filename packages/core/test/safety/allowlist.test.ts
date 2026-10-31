import { describe, expect, it } from 'vitest';
import { DEFAULT_HOSTS, effectiveHosts, isAllowedHost, isValidHostEntry, normalizeHost } from '../../src/safety/allowlist.js';

describe('isValidHostEntry', () => {
  it.each([
    'localhost', 'API.test', 'a-b.example.com', '10.0.0.1', '255.255.255.255', '::1', 'fe80::1', '2001:db8::2:1',
    '*.cdn.test', '*.Example.COM',
  ])('accepts %s', (e) => expect(isValidHostEntry(e)).toBe(true));

  it.each([
    '', '*', '*.', 'a.*.b', '**.x', 'a,b', 'a;b', '<-loopback>', 'a b', ' a', 'a/b', 'a:80', ':::', '1:2:3', '[::1]',
    'localhost.', '-a.test', 'a-.test', 'a..b', `${'a'.repeat(64)}.test`, '256.1.1.1', '1.2.3.4.5',
  ])('rejects %j', (e) => expect(isValidHostEntry(e)).toBe(false));
});

describe('normalizeHost', () => {
  it('lower-cases and strips IPv6 brackets', () => {
    expect(normalizeHost('[::1]')).toBe('::1');
    expect(normalizeHost('LocalHost')).toBe('localhost');
  });
});

describe('effectiveHosts', () => {
  it('puts the loopback defaults first, lower-cases and de-duplicates', () => {
    expect(DEFAULT_HOSTS).toEqual(['localhost', '127.0.0.1', '::1']);
    expect(effectiveHosts(['localhost', 'X.test'])).toEqual(['localhost', '127.0.0.1', '::1', 'x.test']);
  });
});

describe('isAllowedHost', () => {
  const hosts = effectiveHosts(['*.cdn.test', 'API.test']);
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '[::1]', '::1', 'api.test', 'a.cdn.test', 'a.b.cdn.test'])(
    'allows %s',
    (h) => expect(isAllowedHost(h, hosts)).toBe(true),
  );
  it.each(['cdn.test', 'evilcdn.test', 'localhost.', '127.0.0.2', '169.254.169.254', 'example.com', ''])(
    'refuses %j',
    (h) => expect(isAllowedHost(h, hosts)).toBe(false),
  );
});
