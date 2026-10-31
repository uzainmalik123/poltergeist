import type { EarsClauses, EarsKind } from './types.js';

type Keyword = 'WHILE' | 'WHEN' | 'IF' | 'WHERE' | 'THEN';

const FIELD: Record<Keyword, 'trigger' | 'precondition' | null> = {
  WHEN: 'trigger',
  IF: 'trigger',
  WHILE: 'precondition',
  WHERE: 'precondition',
  THEN: null,
};

// A keyword must be followed by whitespace or a comma, so `IF-Match` is not IF (D-27).
const KEYWORD = /\b(while|when|if|where|then)(?=[\s,])/gi;
const SHALL = /\bshall\b/i;
const THE = /\bthe\s+/gi;
const THE_UPPER = /\bTHE\s+/g;

const trimClause = (s: string): string => s.replace(/^[\s,]+|[\s,]+$/g, '');

/**
 * Deterministic EARS classification by keyword (D-16, D-27, Req 1.5).
 * Keywords count in upper case anywhere, or in any case at the start of the text or after a comma.
 */
export function classifyEars(text: string): { kind: EarsKind | 'freeform'; ears: EarsClauses | null } {
  const shall = SHALL.exec(text);
  if (!shall) return { kind: 'freeform', ears: null };

  const head = text.slice(0, shall.index);
  const response = text.slice(shall.index + shall[0].length).trim();

  const keywords: { word: Keyword; start: number; end: number }[] = [];
  for (const m of head.matchAll(KEYWORD)) {
    const word = m[1] as string;
    const upper = word === word.toUpperCase();
    const leading = /(^|,)\s*$/.test(head.slice(0, m.index));
    if (upper || leading) {
      keywords.push({ word: word.toUpperCase() as Keyword, start: m.index, end: m.index + word.length });
    }
  }

  // The final segment holds the last clause (if any) followed by the subject.
  const last = keywords.at(-1);
  const final = last ? head.slice(last.end) : head;
  const lastComma = final.lastIndexOf(',');
  const tailStart = lastComma + 1;
  // Prefer the last upper-case THE, so `THE checkout page of the store` keeps its whole subject (D-27).
  const tail = final.slice(tailStart);
  const theMatch = [...tail.matchAll(THE_UPPER)].at(-1) ?? [...tail.matchAll(THE)].at(-1);
  const subject = theMatch ? trimClause(final.slice(tailStart + theMatch.index + theMatch[0].length)) : '';
  const finalClauseEnd = theMatch ? tailStart + theMatch.index : lastComma >= 0 ? lastComma : final.length;

  const fields: { trigger: string[]; precondition: string[] } = { trigger: [], precondition: [] };
  keywords.forEach((kw, i) => {
    const next = keywords[i + 1];
    const clause = trimClause(next ? head.slice(kw.end, next.start) : final.slice(0, finalClauseEnd));
    const field = FIELD[kw.word];
    if (field && clause) fields[field].push(clause);
  });

  const words = new Set(keywords.map((k) => k.word));
  const kind: EarsKind = words.has('IF')
    ? 'unwanted'
    : words.has('WHEN')
      ? 'event'
      : words.has('WHILE')
        ? 'state'
        : words.has('WHERE')
          ? 'optional'
          : 'ubiquitous';

  const ears: EarsClauses = {
    kind,
    ...(fields.trigger.length && { trigger: fields.trigger.join('; ') }),
    ...(fields.precondition.length && { precondition: fields.precondition.join('; ') }),
    ...(subject && { subject }),
    response,
  };
  return { kind, ears };
}
