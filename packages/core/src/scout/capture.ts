import { errors, type Page } from 'playwright-core';
import type { Redactor } from '../config/redact.js';
import { INTERACTIVE_ROLES, LABELABLE_ROLES, interactiveFromSnapshot, parseAriaLine } from './aria.js';
import type { InteractiveElement, TestIdElement } from './types.js';

export type Capture = { title: string; snapshotFull: string; interactive: InteractiveElement[]; testIds: TestIdElement[] };

/** Milliseconds left before `deadline`. Playwright treats 0 as "no timeout", so a spent budget throws. */
export function remaining(deadline: number, what: string): number {
  const left = deadline - Date.now();
  if (left <= 0) throw new errors.TimeoutError(`${what}: route budget spent`);
  return left;
}

async function attachLabels(page: Page, interactive: InteractiveElement[]): Promise<void> {
  await Promise.all(
    interactive.map(async (e) => {
      if (!LABELABLE_ROLES.has(e.role) || e.name === '' || e.count !== 1) return;
      try {
        if ((await page.getByLabel(e.name, { exact: true }).count()) === 1) e.label = e.name;
      } catch {
        // no label
      }
    }),
  );
}

async function collectTestIds(
  page: Page,
  interactive: InteractiveElement[],
  redactor: Redactor,
  timeout: number,
): Promise<TestIdElement[]> {
  const values = await page
    .locator('[data-testid]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? ''));
  const seen = new Map<string, number>();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  const unique = [...seen].filter(([id, n]) => n === 1 && id !== '' && redactor.redact(id) === id).map(([id]) => id);

  const looked = await Promise.all(
    unique.map(async (testId) => {
      try {
        const first = (await page.getByTestId(testId).ariaSnapshot({ timeout })).split('\n')[0] ?? '';
        return { testId, el: parseAriaLine(first) };
      } catch {
        return { testId, el: null };
      }
    }),
  );
  const list: TestIdElement[] = [];
  for (const { testId, el } of looked) {
    // An element whose name holds a secret is dropped, as in the interactive list.
    if (el && redactor.redact(el.name) !== el.name) continue;
    const entry =
      el && INTERACTIVE_ROLES.has(el.role)
        ? interactive.find((e) => e.role === el.role && e.name === el.name && e.count === 1 && !e.testId)
        : undefined;
    if (entry) entry.testId = testId;
    else list.push(el ? { testId, role: el.role, name: el.name } : { testId });
  }
  return list;
}

/** Snapshot, interactive elements, labels and testIds of the current page (D-20, D-21, D-30). */
export async function captureRoute(
  page: Page,
  opts: { deadline: number; redactor: Redactor; testIdTimeoutMs?: number },
): Promise<Capture> {
  const { deadline, redactor } = opts;
  const raw = await page.locator('body').ariaSnapshot({ timeout: remaining(deadline, 'snapshot') });
  // Parsed before redaction; an element whose name holds a secret could never be targeted, so it's dropped.
  const interactive = interactiveFromSnapshot(raw).filter((e) => redactor.redact(e.name) === e.name);
  await attachLabels(page, interactive);
  remaining(deadline, 'labels');
  const testIds = await collectTestIds(page, interactive, redactor, Math.min(opts.testIdTimeoutMs ?? 250, remaining(deadline, 'testIds')));
  const title = redactor.redact(await page.title());
  return { title, snapshotFull: redactor.redact(raw), interactive, testIds };
}
