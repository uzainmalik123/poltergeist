import type { Heading, List, ListItem, Nodes, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { classifyEars } from './ears.js';
import { criterionHash, normalizeText } from './hash.js';
import type { Criterion, ParsedSpec, SpecWarning } from './types.js';

// `Requirement N` with an optional `:` `.` `-` `–` `—` separator and an optional title (D-16).
// The number must end at a non-word character, so `1a` doesn't match, and neither does `#3` (D-27).
const REQUIREMENT = /^requirement\s+(\d+)(?![\p{L}\p{N}_])\s*(?:[:.\-–—]\s*)?(.*)$/iu;
const REQUIREMENT_LIKE = /^requirement\b/i;

type Section = { requirementId: string; title: string; depth: number; line: number; list: List | null };

/** Suffix for the k-th occurrence (k ≥ 2) of a requirement number: b…z, aa, ab… (D-27). */
export function requirementSuffix(k: number): string {
  let s = '';
  for (let n = k; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
  }
  return s;
}

/**
 * Plain text of a node, with a space between blocks so nested lists, code and tables don't run together,
 * and a space at hard line breaks (which `toString` drops).
 */
function blockText(node: Nodes): string {
  switch (node.type) {
    case 'list':
    case 'listItem':
    case 'blockquote':
    case 'table':
    case 'tableRow':
      return node.children.map((child) => blockText(child)).join(' ');
    case 'break':
      return ' ';
    default:
      return 'children' in node ? node.children.map((child) => blockText(child)).join('') : toString(node);
  }
}

const startLine = (node: { position?: { start: { line: number } } }): number => node.position?.start.line ?? 0;

/**
 * Parse a Kiro `requirements.md` into criteria and warnings (D-16, D-27, Requirement 1).
 * Content never throws; layouts it can't read become named warnings.
 */
export function parseRequirements(markdown: string): ParsedSpec {
  const md = markdown.replace(/^\uFEFF/, '');
  if (md.trim() === '') {
    return { criteria: [], warnings: [{ code: 'empty-spec', message: 'requirements.md is empty.' }] };
  }

  const root = unified().use(remarkParse).parse(md);
  const nodes: RootContent[] = root.children;
  const warnings: SpecWarning[] = [];
  const sections: Section[] = [];

  const hasRequirementHeadings = nodes.some(
    (n) => n.type === 'heading' && REQUIREMENT_LIKE.test(toString(n).trim()),
  );

  if (hasRequirementHeadings) {
    collectRequirements(nodes, sections, warnings);
  } else {
    collectByPosition(nodes, sections, warnings);
  }

  const criteria = sections.flatMap((section) => (section.list ? toCriteria(md, section) : []));
  return { criteria, warnings };
}

function collectRequirements(nodes: RootContent[], sections: Section[], warnings: SpecWarning[]): void {
  const seen = new Map<string, number>();
  let current: Section | null = null;

  const close = (): void => {
    if (current && !current.list) {
      warnings.push({
        code: 'no-criteria',
        message: `Requirement ${current.requirementId} has no numbered list of acceptance criteria.`,
        line: current.line,
      });
    }
    current = null;
  };

  for (const node of nodes) {
    if (node.type === 'heading') {
      const text = toString(node).trim();
      const match = REQUIREMENT.exec(text);
      if (current && node.depth <= (current as Section).depth) close();
      if (match) {
        close();
        current = openRequirement(node, match, seen, warnings);
        sections.push(current);
      } else if (REQUIREMENT_LIKE.test(text)) {
        close();
        warnings.push({
          code: 'unrecognized-heading',
          message: `"${text}" looks like a requirement heading but isn't "Requirement N"; its criteria were skipped.`,
          line: startLine(node),
        });
      }
    } else if (node.type === 'list' && node.ordered && current) {
      takeList(current, node, warnings);
    }
  }
  close();
}

function openRequirement(
  heading: Heading,
  match: RegExpExecArray,
  seen: Map<string, number>,
  warnings: SpecWarning[],
): Section {
  const n = match[1] as string;
  const occurrence = (seen.get(n) ?? 0) + 1;
  seen.set(n, occurrence);
  const requirementId = occurrence === 1 ? n : `${n}${requirementSuffix(occurrence)}`;
  if (occurrence > 1) {
    warnings.push({
      code: 'duplicate-requirement',
      message: `Requirement ${n} appears more than once; this one is ${requirementId}.`,
      line: startLine(heading),
    });
  }
  return { requirementId, title: (match[2] ?? '').trim(), depth: heading.depth, line: startLine(heading), list: null };
}

function takeList(section: Section, list: List, warnings: SpecWarning[]): void {
  if (!section.list) {
    section.list = list;
    return;
  }
  warnings.push({
    code: 'ignored-list',
    message: `Requirement ${section.requirementId} has another numbered list; only the first one is read.`,
    line: startLine(list),
  });
}

/** No `Requirement N` headings: every heading with an ordered list under it becomes a requirement, by position. */
function collectByPosition(nodes: RootContent[], sections: Section[], warnings: SpecWarning[]): void {
  let current: Section | null = null;
  for (const node of nodes) {
    if (node.type === 'heading') {
      current = {
        requirementId: '',
        title: toString(node).trim(),
        depth: node.depth,
        line: startLine(node),
        list: null,
      };
      sections.push(current);
    } else if (node.type === 'list' && node.ordered && current) {
      takeList(current, node, warnings);
    }
  }

  const withLists = sections.filter((s) => s.list);
  sections.splice(0, sections.length, ...withLists);
  withLists.forEach((s, i) => (s.requirementId = String(i + 1)));

  if (withLists.length) {
    warnings.unshift({
      code: 'no-requirement-headings',
      message: 'No "Requirement N" headings; requirements were numbered by heading position.',
    });
  } else {
    warnings.push({ code: 'no-criteria', message: 'No requirements or numbered acceptance criteria were found.' });
  }
}

function toCriteria(md: string, section: Section): Criterion[] {
  const list = section.list as List;
  const start = list.start ?? 1;
  return list.children.map((item: ListItem, index): Criterion => {
    const text = normalizeText(blockText(item));
    const { kind, ears } = classifyEars(text);
    return {
      id: `${section.requirementId}.${start + index}`,
      requirement: section.title,
      requirementId: section.requirementId,
      text,
      raw: md.slice(item.position?.start.offset ?? 0, item.position?.end.offset ?? 0),
      line: startLine(item),
      kind,
      ears,
      hash: criterionHash(text),
    };
  });
}
