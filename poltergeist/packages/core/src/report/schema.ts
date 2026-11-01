import { z } from 'zod';
import { PERSONA_IDS } from '../personas/registry.js';

const PAIR_VERDICTS = ['haunted', 'flaky', 'inconclusive', 'clean', 'notApplicable', 'uncompilable'] as const;
const CRITERION_VERDICTS = ['haunted', 'flaky', 'inconclusive', 'clean', 'notApplicable', 'notRun'] as const;

const PairSchema = z.strictObject({
  persona: z.enum(PERSONA_IDS),
  verdict: z.enum(PAIR_VERDICTS),
  reason: z.string(),
  notes: z.array(z.string()),
  intent: z.string().optional(),
  reps: z.int(),
  repsRun: z.int(),
  threshold: z.int(),
  steps: z.strictObject({ a: z.array(z.string()), b: z.array(z.string()).optional() }).optional(),
  expected: z.array(z.string()),
  /** App-failed assertions, most failures first (F07's tallies plus the plan's expectation). */
  failing: z.array(
    z.strictObject({ index: z.int(), type: z.string(), expected: z.string(), failures: z.int(), lastDetail: z.string() }),
  ),
  /** Reps (1-based) with at least one counted app failure. */
  failedReps: z.array(z.int()),
  outcomes: z.strictObject({ completed: z.int(), timeout: z.int(), planError: z.int(), systemError: z.int(), voided: z.int(), missing: z.int() }),
  /** Relative to the spec folder, `/` separators. */
  artifacts: z.array(z.string()),
});

/** `haunting-report.json`, version 1 (D-35). F11's MCP tools read it. */
export const ReportJsonSchema = z.strictObject({
  version: z.literal(1),
  runId: z.string(),
  target: z.string(),
  model: z.string(),
  reps: z.int(),
  /** ISO 8601, from the run's start. */
  startedAt: z.string(),
  specFile: z.literal('requirements.md'),
  counts: z.strictObject(Object.fromEntries(CRITERION_VERDICTS.map((v) => [v, z.int()])) as Record<(typeof CRITERION_VERDICTS)[number], z.ZodInt>),
  criteria: z.array(
    z.strictObject({
      id: z.string(),
      requirement: z.string(),
      text: z.string(),
      line: z.int(),
      verdict: z.enum(CRITERION_VERDICTS),
      pairs: z.array(PairSchema),
    }),
  ),
  /** How many markdown sections were trimmed to fit 300 lines; this file always has them all. */
  truncated: z.int(),
});
export type ReportJson = z.infer<typeof ReportJsonSchema>;
