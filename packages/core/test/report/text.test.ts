import { describe, expect, it } from 'vitest';
import type { Assertion, Step } from '../../src/compiler/dsl.js';
import { DRAFT_WORDMARK, VERDICT_GLYPHS } from '../../src/report/glyphs.js';
import { ReportJsonSchema } from '../../src/report/schema.js';
import { codeSpan, describeAssertion, describeStep, describeTarget, mdText, oneLine } from '../../src/report/text.js';

describe('oneLine', () => {
  it('collapses newlines, line separators and runs of whitespace', () => {
    expect(oneLine('a\n\n b\u2028c\r\nd\t e')).toBe('a b c d e');
  });
  it('caps at 200 characters with an ellipsis', () => {
    const s = oneLine('x'.repeat(250));
    expect(s).toHaveLength(200);
    expect(s.endsWith('…')).toBe(true);
  });
  it('takes a custom cap', () => expect(oneLine('abcdef', 4)).toBe('abc…'));
  it('escapes bidi and invisible characters as \\uXXXX text (KI-41)', () => {
    const s = oneLine('a\u202Eb\u200Bc\u2066d\uFEFFe\u00ADf');
    expect(s).toBe('a\\u202Eb\\u200Bc\\u2066d\\uFEFFe\\u00ADf');
    expect(s).not.toMatch(/[\u202E\u200B\u2066\uFEFF\u00AD]/);
  });
  it('escapes remaining control characters', () => expect(oneLine('a\u0007b\u009Bc')).toBe('a\\u0007b\\u009Bc'));
  it('treats non-breaking spaces as whitespace', () => expect(oneLine('a\u00A0b\u202Fc')).toBe('a b c'));
});

describe('mdText', () => {
  it('escapes markdown and HTML punctuation (KI-41)', () => {
    expect(mdText('<!-- x [y](z) *w* _v_ #')).toBe('\\<!-- x \\[y\\](z) \\*w\\* \\_v\\_ \\#');
  });
  it('escapes backslashes, backticks and pipes', () => expect(mdText('a\\b `c` |')).toBe('a\\\\b \\`c\\` \\|'));
  it('flattens first', () => expect(mdText('a\nb')).toBe('a b'));
});

describe('codeSpan', () => {
  it('wraps plain text in single backticks', () => expect(codeSpan('a b')).toBe('`a b`'));
  it('uses a fence longer than the longest backtick run', () => expect(codeSpan('x`y')).toBe('``x`y``'));
  it('pads when the text starts or ends with a backtick', () => expect(codeSpan('`a')).toBe('`` `a ``'));
  it('flattens newlines first', () => expect(codeSpan('a\nb')).toBe('`a b`'));
  it('never yields an empty span', () => expect(codeSpan('')).toBe('` `'));
  it('escapes bidi characters inside the span', () => expect(codeSpan('\u202E')).toBe('`\\u202E`'));
});

describe('describeTarget', () => {
  it.each([
    [{ role: 'button', name: 'Claim' }, 'button "Claim"'],
    [{ label: 'Email' }, 'field labelled "Email"'],
    [{ text: 'Hi' }, 'text "Hi"'],
    [{ testId: 'x' }, 'test id "x"'],
  ])('%j → %s', (t, s) => expect(describeTarget(t)).toBe(s));
});

describe('describeStep', () => {
  it.each<[Step, string]>([
    [{ goto: '/market' }, 'go to /market'],
    [{ click: { role: 'button', name: 'Claim Sour Skulls' } }, 'click button "Claim Sour Skulls"'],
    [{ dblclick: { testId: 'buy' } }, 'double-click test id "buy"'],
    [{ fill: { target: { label: 'Name' }, input: { generator: 'naughty' } } }, 'fill field labelled "Name" with generator: naughty'],
    [{ press: 'Enter' }, 'press Enter'],
    [{ back: true }, 'go back'],
    [{ reload: true }, 'reload the page'],
    [{ wait: 500 }, 'wait 500 ms'],
    [{ throttle: { profile: 'slow-3g' } }, 'throttle the network to slow-3g'],
    [{ barrier: 'fire' }, 'wait at barrier "fire" until every actor reaches it'],
    [{ holdRequests: 'POST /api/claims' }, 'hold POST /api/claims requests'],
    [{ releaseRequests: 'POST /api/claims' }, 'release held POST /api/claims requests'],
    [{ login: { account: 'default' } }, 'log in as account "default"'],
    [{ logout: true }, 'log out'],
  ])('%j → %s', (step, s) => expect(describeStep(step)).toBe(s));
});

describe('describeAssertion', () => {
  it.each<[Assertion, string]>([
    [{ textVisible: 'Claimed' }, 'text "Claimed" is visible'],
    [{ textNotVisible: 'Error' }, 'text "Error" is not visible'],
    [{ urlMatches: '/market/*' }, 'URL path matches /market/*'],
    [{ elementCount: { target: { role: 'row', name: 'Sour' }, equals: 1 } }, 'count of row "Sour" equals 1'],
    [{ api: { method: 'GET', path: '/api/candies/sour-skulls', jsonPath: '$.claims.length', equals: 1 } }, 'GET /api/candies/sour-skulls $.claims.length equals 1'],
    [{ api: { method: 'POST', path: '/api/x', status: 400 } }, 'POST /api/x returns status 400'],
    [{ api: { method: 'GET', path: '/api/x', status: 200, equals: 'ok' } }, 'GET /api/x returns status 200, body equals "ok"'],
    [{ noConsoleErrors: true }, 'no console errors'],
    [{ noUncaughtExceptions: true }, 'no uncaught exceptions'],
  ])('%j → %s', (a, s) => expect(describeAssertion(a)).toBe(s));
});

describe('glyphs and wordmark (THEME §4, KI-40)', () => {
  it('has every verdict glyph', () => {
    expect(VERDICT_GLYPHS).toEqual({
      haunted: '[!!]', flaky: '[~~]', inconclusive: '[??]', uncompilable: '[??]', clean: '[ok]', notApplicable: '[--]', notRun: '[  ]',
    });
  });
  it('has the draft wordmark', () => {
    expect(DRAFT_WORDMARK).toContain('╔═╗╔═╗╦  ╔╦╗');
    expect(DRAFT_WORDMARK).toContain('your spec, haunted.');
  });
});

describe('ReportJsonSchema', () => {
  const minimal = {
    version: 1, runId: 'r1', target: 'http://127.0.0.1:4000', model: 'm', reps: 3, startedAt: '2026-11-01T00:00:00.000Z', specFile: 'requirements.md',
    counts: { haunted: 0, flaky: 0, inconclusive: 0, clean: 0, notApplicable: 0, notRun: 0 }, criteria: [], truncated: 0,
  };
  it('accepts version 1', () => expect(ReportJsonSchema.parse(minimal)).toEqual(minimal));
  it('rejects version 2', () => expect(() => ReportJsonSchema.parse({ ...minimal, version: 2 })).toThrow());
});
