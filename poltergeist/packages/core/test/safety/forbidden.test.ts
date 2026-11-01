import { describe, expect, it } from 'vitest';
import { compileForbidden } from '../../src/safety/forbidden.js';

const admin = { method: 'DELETE', path: '/api/admin/*' };
const api = { method: '*', path: '/api/*' };
const match = compileForbidden([admin, api]);

describe('compileForbidden', () => {
  it.each<[string, string, typeof admin | null]>([
    ['delete', 'http://h/api/admin/x', admin],
    ['DELETE', 'http://h/api/%61dmin/x', admin],
    ['GET', 'http://h/api/admin/x?y=1', api],
    ['GET', 'http://h/API/x', null],
    ['GET', 'http://h/api/%E0%A4%A', api],
    ['GET', 'http://h/other', null],
  ])('%s %s', (method, url, expected) => {
    expect(match(method, url)).toBe(expected);
  });

  it('escapes regex characters in paths', () => {
    expect(compileForbidden([{ method: 'GET', path: '/a.b' }])('GET', 'http://h/axb')).toBeNull();
    expect(compileForbidden([{ method: 'GET', path: '/a.b' }])('GET', 'http://h/a.b')).not.toBeNull();
  });

  it('matches nothing with no rules', () => {
    expect(compileForbidden([])('GET', 'http://h/x')).toBeNull();
  });
});
