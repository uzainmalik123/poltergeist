import { describe, expect, it } from 'vitest';
import { effectiveHosts } from '../../src/safety/allowlist.js';
import { classifyRequestFailure } from '../../src/safety/guard.js';

const hosts = effectiveHosts([]);
const failure = (url: string, errorText: string) => ({ url, method: 'GET', resourceType: 'fetch', errorText });

describe('classifyRequestFailure (D-18, D-22)', () => {
  it.each([
    ['net::ERR_PROXY_CONNECTION_FAILED'],
    ['net::ERR_BLOCKED_BY_CLIENT'],
  ])('reports a stopped hop to a non-allowlisted host as host (%s)', (errorText) => {
    expect(classifyRequestFailure(failure('http://example.com/x', errorText), hosts)).toEqual({
      url: 'http://example.com/x',
      host: 'example.com',
      method: 'GET',
      resourceType: 'fetch',
      reason: 'host',
      errorText,
    });
  });

  it('reports any other failure on a non-allowlisted host as leak', () => {
    expect(classifyRequestFailure(failure('http://169.254.169.254/', 'net::ERR_CONNECTION_REFUSED'), hosts)).toMatchObject({
      reason: 'leak',
      host: '169.254.169.254',
      errorText: 'net::ERR_CONNECTION_REFUSED',
    });
    expect(classifyRequestFailure(failure('http://example.com/', 'net::ERR_ABORTED'), hosts)).toMatchObject({ reason: 'leak' });
  });

  it('reports a dead-proxy failure on an allowlisted request as redirect, with the original URL', () => {
    expect(classifyRequestFailure(failure('http://127.0.0.1:4000/go', 'net::ERR_PROXY_CONNECTION_FAILED'), hosts)).toMatchObject({
      reason: 'redirect',
      url: 'http://127.0.0.1:4000/go',
      host: '127.0.0.1',
    });
  });

  it.each(['net::ERR_ABORTED', 'net::ERR_CONNECTION_REFUSED', 'net::ERR_BLOCKED_BY_CLIENT'])(
    'ignores other failures on allowlisted hosts (%s)',
    (errorText) => {
      expect(classifyRequestFailure(failure('http://localhost:4000/x', errorText), hosts)).toBeNull();
    },
  );

  it('ignores non-network schemes', () => {
    expect(classifyRequestFailure(failure('data:text/plain,hi', 'net::ERR_ABORTED'), hosts)).toBeNull();
  });

  it('uses the unbracketed host for IPv6', () => {
    expect(classifyRequestFailure(failure('http://[::1]:4000/x', 'net::ERR_PROXY_CONNECTION_FAILED'), hosts)).toMatchObject({
      reason: 'redirect',
      host: '::1',
    });
  });
});
