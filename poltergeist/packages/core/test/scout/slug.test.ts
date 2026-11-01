import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { slugsFor } from '../../src/scout/slug.js';

const sha6 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 6);

describe('slugsFor', () => {
  it('maps paths to file slugs (design §9)', () => {
    const slugs = slugsFor(['/', '/trade/new', '/market/', '/a b?x=1']);
    expect(slugs.get('/')).toBe('index');
    expect(slugs.get('/trade/new')).toBe('trade__new');
    expect(slugs.get('/market/')).toBe('market');
    expect(slugs.get('/a b?x=1')).toBe('a_b_x_1');
  });

  it('suffixes every path whose slug collides', () => {
    const slugs = slugsFor(['/a.b', '/a_b', '/market']);
    expect(slugs.get('/a.b')).toBe(`a_b-${sha6('/a.b')}`);
    expect(slugs.get('/a_b')).toBe(`a_b-${sha6('/a_b')}`);
    expect(slugs.get('/a.b')).not.toBe(slugs.get('/a_b'));
    expect(slugs.get('/market')).toBe('market');
  });

  it('treats /index and / as a collision', () => {
    const slugs = slugsFor(['/', '/index']);
    expect(slugs.get('/')).toBe(`index-${sha6('/')}`);
    expect(slugs.get('/index')).toBe(`index-${sha6('/index')}`);
  });

  it('is deterministic', () => {
    const paths = ['/a.b', '/a_b', '/', '/x/y'];
    expect([...slugsFor(paths)]).toEqual([...slugsFor(paths)]);
  });
});
