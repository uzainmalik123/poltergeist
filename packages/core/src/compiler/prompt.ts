import { listGenerators } from '../personas/generators/index.js';
import type { Persona } from '../personas/registry.js';
import type { RouteScout } from '../scout/types.js';
import type { Criterion } from '../spec/types.js';
import { PRESS_KEYS } from './dsl.js';

/** Bump whenever the prompt or the DSL changes: it is part of the cache key (Req 5.5). */
export const PROMPT_VERSION = 'f05-1';

/** Plain QA wording only (D-09, Req 5.6). No persona ids or names: the compiler stamps those. */
export const SYSTEM_PROMPT = `You write edge-case end-to-end tests for a web app that the user owns and runs locally on their own machine.

You get one acceptance criterion, one description of how a user behaves, and data about the app pages that matter. Write one test plan in which that user behaviour tries to break the criterion.

Rules:
- Use only the steps listed as allowed. Each actor is a list of steps that runs in its own browser session.
- Targets must be copied exactly from the page data: {"role","name"} from the interactive list, {"label"} from a label, {"testId"} from a test id, or {"text"} from an element name. Never invent targets, CSS selectors or XPath.
- Never write input values. To type into a field, use a fill step with one of the allowed input generator ids.
- "goto" may only open the listed page paths.
- Assertions must check what the criterion promises. When the page cannot show the outcome, prefer an "api" assertion against the app's own read endpoints (a path starting with "/").
- Keep plans short and deterministic: at most 30 steps per actor and "wait" at most 2000 ms.
- If this user behaviour cannot meaningfully exercise this criterion on these pages, answer with kind "notApplicable" and a one-sentence reason instead of a plan.`;

function routeBlock(r: RouteScout): string {
  return [
    `Page ${r.path}${r.title ? ` (title: ${r.title})` : ''}, signed in as: ${r.identity}`,
    `Elements: ${JSON.stringify({ interactive: r.interactive, testIds: r.testIds })}`,
    'Accessibility snapshot:',
    r.snapshot,
  ].join('\n');
}

export function buildUserPrompt(criterion: Criterion, persona: Persona, routes: RouteScout[]): string {
  const gens = new Set<string>(persona.generators);
  const generators = listGenerators()
    .filter((g) => gens.has(g.id))
    .map((g) => `- ${g.id}: ${g.description}`);
  const ears = criterion.ears
    ? Object.entries(criterion.ears)
        .filter(([k, v]) => k !== 'kind' && v !== undefined)
        .map(([k, v]) => `- ${k}: ${String(v)}`)
    : [];
  return [
    `## Acceptance criterion ${criterion.id}`,
    criterion.text,
    ...(ears.length ? ['Clauses:', ...ears] : []),
    '',
    '## User behaviour',
    persona.behaviour,
    persona.actors === 2
      ? 'Write two actors, "a" and "b": the same signed-in user in two browser tabs.'
      : 'Write one actor, "a".',
    '',
    `Allowed steps: ${persona.allowedSteps.join(', ')}`,
    'Allowed input generators:',
    ...generators,
    `Keys for "press": ${PRESS_KEYS.join(', ')}`,
    '',
    '## Pages',
    ...routes.map(routeBlock),
  ].join('\n');
}

export function buildRetryPrompt(errors: string[]): string {
  return [
    'That answer was rejected. Fix these problems and answer again in the same format:',
    ...errors.map((e) => `- ${e}`),
  ].join('\n');
}
