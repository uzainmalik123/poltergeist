import { describe, expect, it } from 'vitest';
import { parseAriaLine } from '../../src/scout/aria.js';
import { TRIM_CHARS, collapseLine, trimForPrompt } from '../../src/scout/trim.js';
import type { InteractiveElement, TestIdElement } from '../../src/scout/types.js';

const MARKER = '… [trimmed]';
const size = (r: { interactive: unknown; testIds: unknown; snapshot: string }) =>
  JSON.stringify({ interactive: r.interactive, testIds: r.testIds, snapshot: r.snapshot }).length;

const buttons = (n: number): InteractiveElement[] =>
  Array.from({ length: n }, (_, i) => ({ role: 'button', name: `Item ${i}`, count: 1 }));
const ids = (n: number): TestIdElement[] => Array.from({ length: n }, (_, i) => ({ testId: `tid-${i}` }));

describe('collapseLine', () => {
  it('collapses a long name on the decoded value and re-encodes it', () => {
    const name = `${'a"b\\'.repeat(30)}`; // 120 chars with quotes and backslashes
    const out = collapseLine(`- button ${JSON.stringify(name)}`);
    expect(parseAriaLine(out)).toEqual({ role: 'button', name: `${name.slice(0, 80)}…` });
  });

  it('collapses long trailing text', () => {
    const text = 'long text '.repeat(20);
    expect(collapseLine(`- paragraph: ${text}`)).toBe(`- paragraph: ${text.slice(0, 80)}…`);
    expect(collapseLine(`  - text: ${text}`)).toBe(`  - text: ${text.slice(0, 80)}…`);
  });

  it('collapses both name and text on one line and it still parses', () => {
    const name = 'n'.repeat(100);
    const text = 't'.repeat(100);
    const out = collapseLine(`- button ${JSON.stringify(name)} [pressed]: ${text}`);
    expect(out).toBe(`- button ${JSON.stringify(`${'n'.repeat(80)}…`)} [pressed]: ${'t'.repeat(80)}…`);
    expect(parseAriaLine(out)?.name).toBe(`${'n'.repeat(80)}…`);
  });

  it('collapses quoted text without breaking its escapes', () => {
    const text = JSON.stringify(`${'q"'.repeat(60)}`);
    const out = collapseLine(`- text: ${text}`);
    const value = out.slice('- text: '.length);
    expect(() => JSON.parse(value) as unknown).not.toThrow();
    expect((JSON.parse(value) as string).length).toBe(81);
  });

  it('leaves short lines alone', () => {
    expect(collapseLine('- button "Claim"')).toBe('- button "Claim"');
    expect(collapseLine('    - /url: /x')).toBe('    - /url: /x');
  });
});

describe('trimForPrompt', () => {
  it('leaves small input unchanged', () => {
    const input = { interactive: buttons(3), testIds: ids(1), snapshotFull: '- button "Item 0"' };
    expect(trimForPrompt(input)).toEqual({ ...input, snapshot: input.snapshotFull, trimmed: false, snapshotFull: undefined });
  });

  it('caps the interactive list at 200 entries and 75% of the budget, keeping the front', () => {
    const r = trimForPrompt({ interactive: buttons(2000), testIds: [], snapshotFull: '' });
    expect(r.interactive.length).toBeLessThanOrEqual(200);
    expect(r.interactive[0]?.name).toBe('Item 0');
    expect(JSON.stringify({ interactive: r.interactive, testIds: r.testIds }).length).toBeLessThanOrEqual(0.75 * TRIM_CHARS);
    expect(r.trimmed).toBe(true);
  });

  it('counts testIds against the same 75%', () => {
    const r = trimForPrompt({ interactive: buttons(300), testIds: ids(300), snapshotFull: '' });
    expect(JSON.stringify({ interactive: r.interactive, testIds: r.testIds }).length).toBeLessThanOrEqual(0.75 * TRIM_CHARS);
  });

  it('cuts a huge snapshot on whole collapsed lines and fits the budget', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `- paragraph: ${`row ${i} `.repeat(10)}`);
    const r = trimForPrompt({ interactive: buttons(50), testIds: [], snapshotFull: lines.join('\n') });
    expect(r.snapshot.endsWith(`\n${MARKER}`)).toBe(true);
    const kept = r.snapshot.split('\n').slice(0, -1);
    kept.forEach((line, i) => expect(line).toBe(collapseLine(lines[i] as string)));
    expect(size(r)).toBeLessThanOrEqual(TRIM_CHARS);
    expect(r.trimmed).toBe(true);
  });

  it('measures the JSON-escaped length for escape-heavy snapshots', () => {
    const lines = Array.from({ length: 3000 }, () => `- text: "${'\\"\\\\'.repeat(15)}"`);
    const r = trimForPrompt({ interactive: [], testIds: [], snapshotFull: lines.join('\n') });
    expect(size(r)).toBeLessThanOrEqual(TRIM_CHARS);
    expect(size(r)).toBeGreaterThan(TRIM_CHARS - 200);
  });

  it('still fits a small budget', () => {
    const r = trimForPrompt({ interactive: buttons(100), testIds: ids(10), snapshotFull: '- paragraph: words\n'.repeat(500) }, 2000);
    expect(r.snapshot.endsWith(MARKER)).toBe(true);
    expect(size(r)).toBeLessThanOrEqual(2000);
  });

  it('drops list entries when even the marker does not fit', () => {
    const r = trimForPrompt({ interactive: buttons(100), testIds: ids(10), snapshotFull: '- button "x"\n'.repeat(50) }, 100);
    expect(r.snapshot).toBe(MARKER);
    expect(size(r)).toBeLessThanOrEqual(100);
  });
});
