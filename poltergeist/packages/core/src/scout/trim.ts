import type { InteractiveElement, TestIdElement } from './types.js';

/** About 4k tokens at 4 characters per token (Req 3.6). */
export const TRIM_CHARS = 16000;
const MAX_ENTRIES = 200;
const LIST_SHARE = 0.75;
const COLLAPSE_AT = 80;
const MARKER = '… [trimmed]';

// indent, `- role`, optional quoted name, attributes, optional `: text`
const LINE = /^(\s*- [^\s:"]+)(?: ("(?:[^"\\]|\\.)*"))?((?: \[[^\]]*\])*)(?::(?: (.*))?)?$/;

const cut = (s: string) => {
  const chars = Array.from(s);
  return chars.length > COLLAPSE_AT ? `${chars.slice(0, COLLAPSE_AT).join('')}…` : s;
};

/** Collapses on the decoded value, then re-encodes, so a cut never lands mid-escape. */
function collapseQuoted(quoted: string): string {
  try {
    const value = JSON.parse(quoted) as string;
    const short = cut(value);
    return short === value ? quoted : JSON.stringify(short);
  } catch {
    return quoted;
  }
}

/** Collapses a long name and long trailing text on one snapshot line to 80 characters plus `…`. */
export function collapseLine(line: string): string {
  const m = LINE.exec(line);
  if (!m) return line;
  const [, head, name, attrs, text] = m;
  const hasColon = line.length > (head as string).length + (name ? name.length + 1 : 0) + (attrs as string).length;
  let out = `${head}${name ? ` ${collapseQuoted(name)}` : ''}${attrs}`;
  if (hasColon) out += ':';
  if (text !== undefined) out += ` ${text.startsWith('"') ? collapseQuoted(text) : cut(text)}`;
  return out;
}

/** Characters a string adds inside a JSON string literal. */
const escLen = (s: string) => JSON.stringify(s).length - 2;

/**
 * Fits a route's prompt-facing part to `budget` (D-21, D-30). The lists keep their front, up to 200
 * entries and 75% of the budget. The snapshot keeps whole collapsed lines. The result always satisfies
 * `JSON.stringify({ interactive, testIds, snapshot }).length <= budget`; the overhead is measured.
 */
export function trimForPrompt(
  input: { interactive: InteractiveElement[]; testIds: TestIdElement[]; snapshotFull: string },
  budget = TRIM_CHARS,
): { interactive: InteractiveElement[]; testIds: TestIdElement[]; snapshot: string; trimmed: boolean } {
  const interactive = input.interactive.slice(0, MAX_ENTRIES);
  const testIds = input.testIds.slice(0, MAX_ENTRIES);
  const listSize = () => JSON.stringify({ interactive, testIds }).length;
  const popOne = () => (testIds.length > 0 ? testIds.pop() : interactive.pop());
  while (listSize() > LIST_SHARE * budget && popOne());

  const lines = input.snapshotFull.split('\n').map(collapseLine);
  const fits = (snapshot: string) => JSON.stringify({ interactive, testIds, snapshot }).length <= budget;
  let snapshot = lines.join('\n');
  let dropped = false;
  if (!fits(snapshot)) {
    dropped = true;
    // Greedy over whole lines, measured by JSON-escaped length, with room for the marker kept.
    let used = JSON.stringify({ interactive, testIds, snapshot: MARKER }).length;
    let n = 0;
    for (const line of lines) {
      const add = escLen(`${line}\n`);
      if (used + add > budget) break;
      used += add;
      n++;
    }
    snapshot = n > 0 ? `${lines.slice(0, n).join('\n')}\n${MARKER}` : MARKER;
    while (!fits(snapshot) && popOne());
  }

  const trimmed =
    dropped ||
    interactive.length < input.interactive.length ||
    testIds.length < input.testIds.length ||
    snapshot !== input.snapshotFull;
  return { interactive, testIds, snapshot, trimmed };
}
