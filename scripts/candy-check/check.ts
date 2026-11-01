import type { ParsedSpec } from '@poltergeist/core';

/** One line of `npm run candy:check` output (F10 Done-when, D-37). */
export type Finding = { level: 'ok' | 'warn' | 'fail'; check: string; message: string };

/** PRD F10: 6–8 requirements, ~25 criteria. Outside these is a warning, not a failure. */
export const SPEC_SHAPE = { requirements: [6, 8], criteria: [20, 30] } as const;
/** PRD F10: `db:reset` in < 1 s. */
export const RESET_BUDGET_MS = 1000;

function inRange(check: string, noun: string, count: number, [min, max]: readonly [number, number]): Finding {
  const ok = count >= min && count <= max;
  return { level: ok ? 'ok' : 'warn', check, message: `${count} ${noun} (expected ${min}–${max})` };
}

/** Kiro's spec parses with zero F01 warnings and has the PRD's shape. */
export function checkSpecShape(spec: ParsedSpec): Finding[] {
  const codes = spec.warnings.map((w) => (w.line === undefined ? w.code : `${w.code} (line ${w.line})`));
  const requirements = new Set(spec.criteria.map((c) => c.requirementId)).size;
  return [
    codes.length === 0
      ? { level: 'ok', check: 'spec-warnings', message: 'F01 parses it with no warnings' }
      : { level: 'fail', check: 'spec-warnings', message: `F01 warnings (log each in KI-16): ${codes.join(', ')}` },
    inRange('spec-requirements', 'requirements', requirements, SPEC_SHAPE.requirements),
    inRange('spec-criteria', 'criteria', spec.criteria.length, SPEC_SHAPE.criteria),
  ];
}

/** Every reset finishes within `RESET_BUDGET_MS`. */
export function checkResetTiming(durationsMs: number[]): Finding {
  const max = Math.max(...durationsMs);
  const runs = durationsMs.map((d) => `${d} ms`).join(', ');
  return max <= RESET_BUDGET_MS
    ? { level: 'ok', check: 'reset-time', message: `db:reset took ${runs} (budget ${RESET_BUDGET_MS} ms)` }
    : { level: 'fail', check: 'reset-time', message: `db:reset took up to ${max} ms (${runs}); budget is ${RESET_BUDGET_MS} ms` };
}

/** JSON with object keys sorted recursively; array order is kept. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** The `db:dump` after each reset is the same data. */
export function checkDeterminism(dumps: string[]): Finding {
  const forms: string[] = [];
  for (const [i, dump] of dumps.entries()) {
    try {
      forms.push(JSON.stringify(canonical(JSON.parse(dump))));
    } catch {
      return { level: 'fail', check: 'reset-deterministic', message: `db:dump #${i + 1} is not valid JSON` };
    }
  }
  return forms.every((f) => f === forms[0])
    ? { level: 'ok', check: 'reset-deterministic', message: `${dumps.length} resets gave identical db:dump output` }
    : { level: 'fail', check: 'reset-deterministic', message: 'db:dump differs between resets: the seed is not deterministic' };
}
