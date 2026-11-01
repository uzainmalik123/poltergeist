import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/personas/index.js';
import { EXCLUDED_SECTIONS, naughtyValues, parseBlns } from '../../src/personas/generators/naughty.js';

const DATA = new URL('../../src/personas/generators/data/', import.meta.url);
const blns = readFileSync(new URL('blns.txt', DATA), 'utf8');

describe('parseBlns', () => {
  const titles = parseBlns(blns).sections.map((s) => s.title);

  it('excludes exactly the injection and vulnerability sections', () => {
    expect(EXCLUDED_SECTIONS).toEqual([
      'Script Injection',
      'SQL Injection',
      'Server Code Injection',
      'Command Injection (Ruby)',
      'XXE Injection (XML)',
      'File Inclusion',
      'Known CVEs and Vulnerabilities',
      'Terminal escape codes',
      'iOS Vulnerabilities',
      'jinja2 injection',
    ]);
  });

  it('finds every excluded section in the vendored file (both header styles)', () => {
    for (const t of EXCLUDED_SECTIONS) expect(titles).toContain(t);
  });

  it('finds the sections we keep', () => {
    for (const t of ['Reserved Strings', 'Emoji', 'Right-To-Left Strings']) expect(titles).toContain(t);
  });

  it('keeps whitespace-only lines as values and recognises space-indented headers', () => {
    const sample = '#\tA\n#\tdesc\n\nx\n \n\n#      B\n#\ny\n';
    expect(parseBlns(sample).sections).toEqual([
      { title: 'A', values: ['x', ' '] },
      { title: 'B', values: ['y'] },
    ]);
  });

  it('accepts CRLF line endings', () => {
    expect(parseBlns('#\tA\r\n\r\nx\r\n').sections).toEqual([{ title: 'A', values: ['x'] }]);
  });
});

describe('naughtyValues', () => {
  const vs = naughtyValues();

  it('has a substantial list without injection payloads', () => {
    expect(vs.length).toBeGreaterThan(200);
    for (const v of vs) {
      expect(v).not.toContain('<script');
      expect(v).not.toContain('DROP TABLE');
      expect(v).not.toContain('%x(');
      expect(v).not.toContain('{%');
      expect(v).not.toContain('{{');
      expect(v).not.toContain('__class__');
      expect(v).not.toContain(String.fromCharCode(27) + '[');
    }
  });

  it('keeps classic QA strings, including whitespace-only ones', () => {
    expect(vs).toContain('undefined');
    expect(vs).toContain('NaN');
    expect(vs.some((v) => v.length > 0 && v.trim() === '')).toBe(true);
  });

  it('is frozen and has no duplicates', () => {
    expect(Object.isFrozen(vs)).toBe(true);
    expect(new Set(vs).size).toBe(vs.length);
  });
});

describe("generate('naughty')", () => {
  it('returns members of the list, the same every time', () => {
    const set = new Set(naughtyValues());
    for (const seed of [0, 1, 42]) {
      for (let i = 0; i < 20; i++) {
        const v = generate('naughty', seed, i);
        expect(set.has(v)).toBe(true);
        expect(generate('naughty', seed, i)).toBe(v);
      }
    }
  });
});

describe('licence', () => {
  it('ships the upstream MIT licence next to the data', () => {
    const lic = new URL('LICENSE-blns', DATA);
    expect(existsSync(lic)).toBe(true);
    expect(readFileSync(lic, 'utf8')).toContain('Max Woolf');
  });
});
