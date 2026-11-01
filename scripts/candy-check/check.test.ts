import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRequirements, parseSpec } from '@poltergeist/core';
import { checkDeterminism, checkResetTiming, checkSpecShape, RESET_BUDGET_MS } from './check.js';

const here = dirname(fileURLToPath(import.meta.url));
const specFixture = (name: string): string => join(here, '../../packages/core/test/fixtures/spec', name);
const byCheck = (findings: { check: string; level: string }[]) =>
  Object.fromEntries(findings.map((f) => [f.check, f.level]));

/** A Kiro-format spec with `reqs` requirements and `perReq` criteria each. */
function syntheticSpec(reqs: number, perReq: number[]): string {
  const parts = ['# Requirements Document', '', '## Requirements', ''];
  for (let r = 1; r <= reqs; r++) {
    parts.push(`### Requirement ${r}: Thing ${r}`, '', '#### Acceptance Criteria', '');
    for (let c = 1; c <= perReq[r - 1]!; c++) parts.push(`${c}. WHEN a user acts, THE App SHALL respond ${c}.`);
    parts.push('');
  }
  return parts.join('\n');
}

describe('checkSpecShape', () => {
  it('warns on the draft spec counts (5 requirements, 13 criteria) but finds no parse warnings', async () => {
    const findings = checkSpecShape(await parseSpec(specFixture('candy-swap-draft')));
    expect(byCheck(findings)).toEqual({ 'spec-warnings': 'ok', 'spec-requirements': 'warn', 'spec-criteria': 'warn' });
  });

  it('fails on parse warnings and names each warning code', async () => {
    const findings = checkSpecShape(await parseSpec(specFixture('messy')));
    const warnings = findings.find((f) => f.check === 'spec-warnings')!;
    expect(warnings.level).toBe('fail');
    expect(warnings.message).toContain('duplicate-requirement');
  });

  it('is all ok for 7 requirements and 25 criteria', () => {
    const findings = checkSpecShape(parseRequirements(syntheticSpec(7, [4, 4, 4, 4, 3, 3, 3])));
    expect(findings.every((f) => f.level === 'ok')).toBe(true);
  });
});

describe('checkResetTiming', () => {
  it(`is ok up to ${RESET_BUDGET_MS} ms and fails over it, naming the slowest run`, () => {
    expect(checkResetTiming([300, 999]).level).toBe('ok');
    const slow = checkResetTiming([300, 1001]);
    expect(slow.level).toBe('fail');
    expect(slow.message).toContain('1001');
  });
});

describe('checkDeterminism', () => {
  it('ignores whitespace and key order', () => {
    expect(checkDeterminism(['{"a":1,"b":[1,2]}', '{ "b":[1,2], "a":1 }']).level).toBe('ok');
  });

  it('keeps array order', () => {
    expect(checkDeterminism(['[1,2]', '[2,1]']).level).toBe('fail');
  });

  it('fails on invalid JSON', () => {
    expect(checkDeterminism(['{', '{}']).level).toBe('fail');
  });
});
