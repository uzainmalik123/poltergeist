import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRequirements, parseSpec, type ParsedSpec } from '../../src/spec/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const OWN = join(repoRoot, '.kiro/specs/poltergeist');
/** Kiro-generated in F10 (D-37); the test below is skipped until it exists. */
const CANDY_REAL = join(repoRoot, 'fixtures/candy-swap/.kiro/specs/candy-swap');
/**
 * F01 warning codes on Kiro's Candy Swap spec, each one logged as a KI-16 note. Kiro's spec is never edited
 * (D-37), so a new warning is recorded here and in KI-16 rather than fixed in the spec. Shape is `candy:check`'s.
 */
const CANDY_KNOWN_WARNINGS: string[] = [];
const fixture = (name: string): string => join(here, '../fixtures/spec', name);
const FIXTURES = { own: OWN, reanimator: fixture('reanimator'), candy: fixture('candy-swap-draft'), messy: fixture('messy') };

const ids = (spec: ParsedSpec): string[] => spec.criteria.map((c) => c.id);

describe('Done-when fixtures', () => {
  it("parses this repo's own spec with no warnings", async () => {
    const spec = await parseSpec(OWN);
    expect(spec.warnings).toEqual([]);
    const md = readFileSync(join(OWN, 'requirements.md'), 'utf8');
    const numbered = md
      .slice(md.indexOf('### Requirement 1'))
      .split('\n')
      .filter((l) => /^\d+\. /.test(l)).length;
    expect(spec.criteria).toHaveLength(numbered);
    const req1 = spec.criteria.filter((c) => c.requirementId === '1');
    expect(req1.map((c) => c.id)).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8']);
    expect(req1[7]!.text).toContain('SpecNotFoundError');
    for (const c of spec.criteria) {
      if (/\bSHALL\b/.test(c.text)) expect(c.kind, c.id).not.toBe('freeform');
    }
  });

  it('parses the Reanimator spec', async () => {
    const spec = await parseSpec(FIXTURES.reanimator);
    expect(spec.warnings).toEqual([]);
    expect([...new Set(spec.criteria.map((c) => c.requirementId))]).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
    );
    expect(spec.criteria).toHaveLength(31);
  });

  it.skipIf(!existsSync(join(CANDY_REAL, 'requirements.md')))(
    'parses the real Kiro-generated Candy Swap spec with only the warnings logged in KI-16 (F10)',
    async () => {
      const spec = await parseSpec(CANDY_REAL);
      expect(spec.warnings.map((w) => w.code)).toEqual(CANDY_KNOWN_WARNINGS);
      expect(spec.criteria.length).toBeGreaterThan(0);
    },
  );

  it('parses the Candy Swap draft', async () => {
    const spec = await parseSpec(FIXTURES.candy);
    expect(spec.warnings).toEqual([]);
    expect(ids(spec)).toEqual([
      '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '5.3',
    ]);
    expect(spec.criteria.map((c) => c.kind)).toEqual([
      'event', 'unwanted', 'state', 'event', 'unwanted', 'ubiquitous', 'event', 'unwanted', 'event', 'unwanted',
      'event', 'optional', 'freeform',
    ]);
  });

  it('reports every messy layout as a named warning', async () => {
    const spec = await parseSpec(FIXTURES.messy);
    expect(spec.warnings.map((w) => w.code)).toEqual([
      'duplicate-requirement',
      'no-criteria',
      'unrecognized-heading',
      'unrecognized-heading',
      'ignored-list',
      'no-criteria',
    ]);
    expect(ids(spec)).toEqual(['1.1', '1b.1', '5.1', '5.2', '7.1', '7.2']);
    const byId = new Map(spec.criteria.map((c) => [c.id, c]));
    expect(byId.get('5.1')!.kind).toBe('ubiquitous');
    expect(byId.get('5.2')!.kind).toBe('freeform');
    expect(byId.get('7.1')!.text).toBe('THE CLI SHALL print the summary: haunted: 1');
    expect(byId.get('7.2')!.ears).toMatchObject({ kind: 'event', trigger: 'the user presses q', subject: 'cli' });
  });
});

describe('stability', () => {
  it.each(Object.entries(FIXTURES))('re-parsing %s gives the same result', async (_name, dir) => {
    expect(await parseSpec(dir)).toEqual(await parseSpec(dir));
  });

  it('keeps every hash when a criterion is inserted above', () => {
    const md = readFileSync(join(FIXTURES.candy, 'requirements.md'), 'utf8');
    const before = parseRequirements(md);
    const inserted = md.replace(
      '1. WHEN a user submits a valid email',
      '1. THE Login_Page SHALL show a sign-in form.\n2. WHEN a user submits a valid email',
    );
    const after = parseRequirements(inserted);
    expect(after.criteria[0]!.text).toBe('THE Login_Page SHALL show a sign-in form.');
    const afterHashes = new Set(after.criteria.map((c) => c.hash));
    for (const c of before.criteria) expect(afterHashes.has(c.hash), c.id).toBe(true);
  });

  it('gives the same ids, hashes and lines for CRLF with a BOM', () => {
    const md = readFileSync(join(OWN, 'requirements.md'), 'utf8');
    const pick = (s: ParsedSpec) => s.criteria.map((c) => [c.id, c.hash, c.line]);
    const crlf = parseRequirements(`\uFEFF${md.replace(/\n/g, '\r\n')}`);
    expect(pick(crlf)).toEqual(pick(parseRequirements(md)));
    expect(crlf.warnings).toEqual([]);
  });
});

describe('performance', () => {
  it('parses 200 criteria in under 200 ms', () => {
    const md = Array.from({ length: 20 }, (_, r) => {
      const items = Array.from(
        { length: 10 },
        (_, i) => `${i + 1}. WHEN step ${i} happens, THE Component_${r} SHALL respond within ${i} seconds.`,
      );
      return `### Requirement ${r + 1}: Area ${r}\n\n#### Acceptance Criteria\n\n${items.join('\n')}`;
    }).join('\n\n');
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      const { criteria } = parseRequirements(md);
      best = Math.min(best, performance.now() - t0);
      expect(criteria).toHaveLength(200);
    }
    expect(best).toBeLessThan(200);
  });
});
