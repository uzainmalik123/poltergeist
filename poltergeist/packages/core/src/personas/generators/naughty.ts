import { readFileSync } from 'node:fs';
import { pick } from './lists.js';

/**
 * Sections of the Big List of Naughty Strings we leave out. They are exploit payloads, and
 * Poltergeist is a QA tool, not a security scanner (D-08, F25 scrapped, D-31).
 */
export const EXCLUDED_SECTIONS: readonly string[] = Object.freeze([
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

export type BlnsSection = { title: string; values: string[] };

/**
 * Parses BLNS `blns.txt`. A header is a `#` line at the start of the file or right after a
 * truly empty line; other `#` lines are comments. Every other non-empty line, including
 * whitespace-only ones, is a value of the current section.
 */
export function parseBlns(text: string): { sections: BlnsSection[] } {
  const sections: BlnsSection[] = [];
  let current: BlnsSection | undefined;
  let prev: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#')) {
      if (prev === undefined || prev === '') {
        current = { title: line.replace(/^#\s*/, '').trim(), values: [] };
        sections.push(current);
      }
    } else if (line !== '' && current) {
      current.values.push(line);
    }
    prev = line;
  }
  return { sections };
}

let cached: readonly string[] | undefined;

/** The vendored list minus `EXCLUDED_SECTIONS`, deduplicated. Read once, then cached. */
export function naughtyValues(): readonly string[] {
  if (!cached) {
    const text = readFileSync(new URL('./data/blns.txt', import.meta.url), 'utf8');
    const excluded = new Set(EXCLUDED_SECTIONS);
    const values = parseBlns(text)
      .sections.filter((s) => !excluded.has(s.title))
      .flatMap((s) => s.values);
    cached = Object.freeze([...new Set(values)]);
  }
  return cached;
}

export const naughty = (seed: number, index: number): string => pick(naughtyValues(), seed, index);
