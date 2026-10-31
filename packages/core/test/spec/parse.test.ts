import { describe, expect, it } from 'vitest';
import { parseRequirements, type SpecWarningCode } from '../../src/spec/index.js';
import { requirementSuffix } from '../../src/spec/parse.js';

const codes = (md: string): SpecWarningCode[] => parseRequirements(md).warnings.map((w) => w.code);
const ids = (md: string): string[] => parseRequirements(md).criteria.map((c) => c.id);

const BASIC = `# Requirements Document

## Requirements

### Requirement 1: Reading specs

**User Story:** As a developer, I want things.

#### Acceptance Criteria

1. WHEN the user runs it, THE Reader SHALL parse.
2. THE Reader SHALL hash.
3. IF the file is missing, THEN THE Reader SHALL throw.

### Requirement 2: Config

#### Acceptance Criteria

1. THE Loader SHALL load.
2. WHILE running, THE Guard SHALL block.
`;

describe('parseRequirements', () => {
  it('parses requirements and criteria with N.M ids', () => {
    const { criteria, warnings } = parseRequirements(BASIC);
    expect(warnings).toEqual([]);
    expect(criteria.map((c) => c.id)).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2']);
    const first = criteria[0]!;
    expect(first).toMatchObject({
      requirement: 'Reading specs',
      requirementId: '1',
      text: 'WHEN the user runs it, THE Reader SHALL parse.',
      raw: '1. WHEN the user runs it, THE Reader SHALL parse.',
      line: 11,
      kind: 'event',
    });
    expect(first.hash).toMatch(/^[0-9a-f]{12}$/);
    expect(criteria[2]!.kind).toBe('unwanted');
    expect(criteria[4]!).toMatchObject({ requirement: 'Config', requirementId: '2', line: 20, kind: 'state' });
  });

  it('accepts heading variants', () => {
    const md = [
      '### Requirement 3: A\n\n1. THE X SHALL a.',
      '## requirement 4. B\n\n1. THE X SHALL b.',
      '#### Requirement 5 – C\n\n1. THE X SHALL c.',
      '### Requirement 6\n\n1. THE X SHALL d.',
    ].join('\n\n');
    const { criteria, warnings } = parseRequirements(md);
    expect(warnings).toEqual([]);
    expect(criteria.map((c) => [c.requirementId, c.requirement])).toEqual([
      ['3', 'A'],
      ['4', 'B'],
      ['5', 'C'],
      ['6', ''],
    ]);
  });

  it('parses a list with no Acceptance Criteria sub-heading', () => {
    expect(ids('### Requirement 1: A\n\n1. THE X SHALL a.\n2. THE X SHALL b.\n')).toEqual(['1.1', '1.2']);
  });

  it('suffixes duplicate requirement numbers', () => {
    const md = ['### Requirement 2: A', '### Requirement 2: B', '### Requirement 2: C']
      .map((h) => `${h}\n\n1. THE X SHALL y.`)
      .join('\n\n');
    const { criteria, warnings } = parseRequirements(md);
    expect(criteria.map((c) => c.id)).toEqual(['2.1', '2b.1', '2c.1']);
    expect(criteria.map((c) => c.requirementId)).toEqual(['2', '2b', '2c']);
    expect(warnings.map((w) => w.code)).toEqual(['duplicate-requirement', 'duplicate-requirement']);
    expect(warnings[0]!.line).toBe(5);
  });

  it.each([
    [2, 'b'],
    [26, 'z'],
    [27, 'aa'],
    [28, 'ab'],
    [53, 'ba'],
  ])('suffix for occurrence %i is %s', (k, s) => {
    expect(requirementSuffix(k)).toBe(s);
  });

  it('warns no-criteria for a bulleted list', () => {
    const { criteria, warnings } = parseRequirements('### Requirement 1: A\n\n- WHEN x, THE Y SHALL z.\n');
    expect(criteria).toEqual([]);
    expect(warnings).toMatchObject([{ code: 'no-criteria', line: 1 }]);
  });

  it('ignores a second ordered list, including one under a deeper heading', () => {
    const md = '### Requirement 1: A\n\n1. THE X SHALL a.\n\nText.\n\n1. THE X SHALL extra.\n\n#### Notes\n\n1. Note one.\n';
    expect(ids(md)).toEqual(['1.1']);
    expect(codes(md)).toEqual(['ignored-list', 'ignored-list']);
  });

  it.each(['### Requirement 1a: A', '### Requirement #3: A'])('warns unrecognized-heading for %s', (h) => {
    const { criteria, warnings } = parseRequirements(`${h}\n\n1. THE X SHALL a.\n`);
    expect(criteria).toEqual([]);
    expect(warnings).toMatchObject([{ code: 'unrecognized-heading', line: 1 }]);
  });

  it('does not read a list in a blockquote', () => {
    expect(codes('### Requirement 1: A\n\n> 1. THE X SHALL a.\n')).toEqual(['no-criteria']);
  });

  it('keeps a criterion without SHALL as freeform', () => {
    const [c] = parseRequirements('### Requirement 1: A\n\n1. The page should load fast.\n').criteria;
    expect(c).toMatchObject({ id: '1.1', kind: 'freeform', ears: null });
  });

  it('folds nested bullets, code and links into the text', () => {
    const md =
      '### Requirement 1: A\n\n1. THE Reader SHALL throw `SpecNotFoundError`, see [docs](x.md).\n   - sub one\n   - sub two\n';
    const [c] = parseRequirements(md).criteria;
    expect(c!.text).toBe('THE Reader SHALL throw SpecNotFoundError, see docs. sub one sub two');
    expect(c!.raw).toContain('- sub two');
  });

  it('includes a fenced code block in the text', () => {
    const md = '### Requirement 1: A\n\n1. THE X SHALL print:\n\n   ```\n   hello\n   ```\n';
    expect(parseRequirements(md).criteria[0]!.text).toBe('THE X SHALL print: hello');
  });

  it('numbers from the list start', () => {
    expect(ids('### Requirement 1: A\n\n3. THE X SHALL a.\n4. THE X SHALL b.\n')).toEqual(['1.3', '1.4']);
  });

  it('numbers headings by position when there are no requirement headings', () => {
    const md = '## Login\n\n1. THE X SHALL a.\n\n## Cart\n\n1. THE X SHALL b.\n';
    const { criteria, warnings } = parseRequirements(md);
    expect(criteria.map((c) => [c.id, c.requirement])).toEqual([
      ['1.1', 'Login'],
      ['2.1', 'Cart'],
    ]);
    expect(warnings.map((w) => w.code)).toEqual(['no-requirement-headings']);
  });

  it('warns no-criteria for prose with no requirements or lists', () => {
    expect(parseRequirements('# Title\n\nJust prose.\n').warnings).toEqual([
      { code: 'no-criteria', message: expect.any(String) },
    ]);
  });

  it.each(['', '  \n', '﻿'])('warns empty-spec for %j', (md) => {
    expect(parseRequirements(md)).toEqual({ criteria: [], warnings: [{ code: 'empty-spec', message: expect.any(String) }] });
  });

  it('closes a requirement at a heading of the same or higher level', () => {
    const md = '### Requirement 1: A\n\n### Other\n\n1. THE X SHALL a.\n';
    expect(ids(md)).toEqual([]);
    expect(codes(md)).toEqual(['no-criteria']);
  });

  it('never throws on random markdown', () => {
    const fragments = ['#', '### ', 'Requirement 1', 'Requirement 2:', '1. ', '3. ', '- ', '> ', '```', '|a|b|', '\r\n', '\n', 'THE X SHALL y', 'WHEN', ', ', 'text', '   '];
    let seed = 42;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed;
    };
    for (let i = 0; i < 500; i++) {
      let md = '';
      const len = next() % 60;
      for (let j = 0; j < len; j++) md += fragments[next() % fragments.length];
      expect(() => parseRequirements(md)).not.toThrow();
    }
  });
});
