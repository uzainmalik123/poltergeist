import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPORT_FILES, ReportJsonSchema, type ReportJson } from '@poltergeist/core';
import { capIds, capText } from './format.js';

export class NoReportError extends Error {
  override name = 'NoReportError';
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function readJson(specDir: string): Promise<ReportJson | undefined> {
  try {
    return ReportJsonSchema.parse(JSON.parse(await readFile(join(specDir, REPORT_FILES.json), 'utf8')));
  } catch {
    return undefined;
  }
}

/** Where the section whose heading starts at `start` ends: the next line matching `next`, or the end. */
function sectionEnd(markdown: string, start: number, next: RegExp): number {
  const body = markdown.indexOf('\n', start);
  if (body === -1) return markdown.length;
  const end = markdown.slice(body + 1).search(next);
  return end === -1 ? markdown.length : body + 1 + end;
}

/**
 * The spec's haunting report, agent-sized (Req 10.2, D-38): the header and board without a
 * criterion; that criterion's markdown section with one, or a short summary from the JSON
 * when the markdown has no section for it (clean, or trimmed to fit 300 lines).
 */
export async function readReport(specDir: string, criterion?: string): Promise<string> {
  let markdown: string;
  try {
    markdown = await readFile(join(specDir, REPORT_FILES.markdown), 'utf8');
  } catch {
    throw new NoReportError(`no ${REPORT_FILES.markdown} in ${specDir} yet; call summon_ghosts first`);
  }

  if (criterion === undefined) {
    const board = markdown.search(/^## Board$/m);
    const head = board === -1 ? markdown : markdown.slice(0, sectionEnd(markdown, board, /^## /m));
    return capText(`${head.trimEnd()}\n\nAsk for one criterion with get_haunting_report { criterion }.\n`);
  }

  const heading = new RegExp(`^### \\S+ ${escapeRegExp(criterion)} — `, 'm');
  const start = markdown.search(heading);
  if (start !== -1) {
    return capText(markdown.slice(start, sectionEnd(markdown, start, /^#{2,3} /m)).trimEnd() + '\n');
  }

  const json = await readJson(specDir);
  const row = json?.criteria.find((c) => c.id === criterion);
  if (!row) {
    const known = json ? capIds(json.criteria.map((c) => c.id)).join(', ') : 'none (haunting-report.json is missing)';
    throw new RangeError(`unknown criterion id: ${criterion} (known: ${known})`);
  }
  const lines = [`### ${row.id} — ${row.verdict}`, '', row.text, ''];
  for (const p of row.pairs) {
    const detail = p.failing[0]?.lastDetail;
    lines.push(`- ${p.persona}: ${p.verdict} — ${p.reason}${detail ? ` (${detail})` : ''}`);
  }
  if (row.pairs.length === 0) lines.push('- no persona results');
  return capText(lines.join('\n') + '\n');
}
