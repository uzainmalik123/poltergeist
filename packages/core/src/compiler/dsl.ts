import { z } from 'zod';
import { GENERATOR_IDS } from '../personas/generators/index.js';
import { PERSONA_IDS } from '../personas/registry.js';
import type { StepType } from '../personas/steps.js';

/**
 * The Haunting Plan DSL (design §6, D-32): the single definition of the LLM's output contract.
 * Field-level limits (lengths, ranges, patterns) are checked in `validate.ts`, so the model gets
 * clear messages and the structured-output schema stays inside what the API supports.
 */

/** D-15 targets. Validation also requires that Scout emitted them (D-21). */
export const PlanTargetSchema = z.union([
  z.strictObject({ role: z.string(), name: z.string() }),
  z.strictObject({ label: z.string() }),
  z.strictObject({ text: z.string() }),
  z.strictObject({ testId: z.string() }),
]);
export type PlanTarget = z.infer<typeof PlanTargetSchema>;

export const PRESS_KEYS = Object.freeze([
  'Enter', 'Tab', 'Escape', 'Space', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
] as const);
export type PressKey = (typeof PRESS_KEYS)[number];

export const THROTTLE_PROFILES = Object.freeze(['slow-3g', 'fast-3g'] as const);

/** `holdRequests` / `releaseRequests` patterns: `METHOD /path`. */
export const REQUEST_PATTERN = /^(GET|POST|PUT|PATCH|DELETE) \/\S*$/;

/** Inputs always come from a generator, never from the LLM (D-04, D-32). */
const InputSchema = z.strictObject({ generator: z.enum(GENERATOR_IDS) });

export const StepSchema = z.union([
  z.strictObject({ goto: z.string() }),
  z.strictObject({ click: PlanTargetSchema }),
  z.strictObject({ dblclick: PlanTargetSchema }),
  z.strictObject({ fill: z.strictObject({ target: PlanTargetSchema, input: InputSchema }) }),
  z.strictObject({ press: z.enum(PRESS_KEYS) }),
  z.strictObject({ back: z.literal(true) }),
  z.strictObject({ reload: z.literal(true) }),
  z.strictObject({ wait: z.int() }),
  z.strictObject({ throttle: z.strictObject({ profile: z.enum(THROTTLE_PROFILES) }) }),
  z.strictObject({ barrier: z.string() }),
  z.strictObject({ holdRequests: z.string() }),
  z.strictObject({ releaseRequests: z.string() }),
  z.strictObject({ login: z.strictObject({ account: z.string() }) }),
  z.strictObject({ logout: z.literal(true) }),
]);
export type Step = z.infer<typeof StepSchema>;

/** The step's single key. */
export function stepType(step: Step): StepType {
  return Object.keys(step)[0] as StepType;
}

const HTTP_METHOD = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const AssertionSchema = z.union([
  z.strictObject({ textVisible: z.string() }),
  z.strictObject({ textNotVisible: z.string() }),
  z.strictObject({ urlMatches: z.string() }),
  z.strictObject({ elementCount: z.strictObject({ target: PlanTargetSchema, equals: z.int() }) }),
  z.strictObject({
    api: z.strictObject({
      method: HTTP_METHOD,
      path: z.string(),
      jsonPath: z.string().optional(),
      status: z.int().optional(),
      equals: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    }),
  }),
  z.strictObject({ noConsoleErrors: z.literal(true) }),
  z.strictObject({ noUncaughtExceptions: z.literal(true) }),
]);
export type Assertion = z.infer<typeof AssertionSchema>;

export const ActorsSchema = z.strictObject({ a: z.array(StepSchema), b: z.array(StepSchema).optional() });
export type Actors = z.infer<typeof ActorsSchema>;

const PlanBodySchema = z.strictObject({
  kind: z.literal('plan'),
  intent: z.string(),
  actors: ActorsSchema,
  assert: z.array(AssertionSchema),
});
export type PlanBody = z.infer<typeof PlanBodySchema>;

/** What the LLM returns. The wrapper exists because a structured-output root must be an object. */
export const LlmOutputSchema = z.strictObject({
  result: z.discriminatedUnion('kind', [
    PlanBodySchema,
    z.strictObject({ kind: z.literal('notApplicable'), reason: z.string() }),
  ]),
});
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

export const PlanRouteSchema = z.strictObject({ path: z.string(), identity: z.string() });
export type PlanRoute = z.infer<typeof PlanRouteSchema>;

/** A compiled plan: the LLM's body plus the fields the compiler stamps (D-32). */
export const HauntingPlanSchema = z.strictObject({
  criterion: z.string(),
  persona: z.enum(PERSONA_IDS),
  intent: z.string(),
  routes: z.array(PlanRouteSchema),
  actors: ActorsSchema,
  assert: z.array(AssertionSchema),
});
export type HauntingPlan = z.infer<typeof HauntingPlanSchema>;
