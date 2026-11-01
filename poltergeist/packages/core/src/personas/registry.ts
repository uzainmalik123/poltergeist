import { UnknownPersonaError } from './errors.js';
import type { GeneratorId } from './generators/index.js';
import type { StepType } from './steps.js';

/** Built-in personas (D-13). Lich and Revenant arrive in F16, Changeling in F20. */
export const PERSONA_IDS = Object.freeze(['wraith', 'banshee', 'doppelganger'] as const);

export type PersonaId = (typeof PERSONA_IDS)[number];

/**
 * `name` and `tagline` are UI copy and may be themed. `behaviour` goes into the compiler's
 * prompt, so it uses plain QA wording (D-09). `sprite` is a key the Costume Kit resolves (F26).
 */
export type Persona = {
  readonly id: PersonaId;
  readonly name: string;
  readonly tagline: string;
  readonly behaviour: string;
  readonly allowedSteps: readonly StepType[];
  readonly generators: readonly GeneratorId[];
  readonly actors: 1 | 2;
  readonly sprite: string;
};

function define(p: Persona): Persona {
  return Object.freeze({
    ...p,
    allowedSteps: Object.freeze([...p.allowedSteps]),
    generators: Object.freeze([...p.generators]),
  });
}

const PERSONAS: ReadonlyMap<PersonaId, Persona> = new Map(
  [
    define({
      id: 'wraith',
      name: 'Wraith',
      tagline: 'Double-clicks, resubmits and reloads mid-request.',
      behaviour:
        'An impatient user. Double-clicks buttons, submits the same form twice, and presses Back or reloads the page while a request is still in flight. Checks that the action happened exactly once and the page is not left stuck or inconsistent.',
      allowedSteps: ['goto', 'click', 'dblclick', 'fill', 'press', 'back', 'reload', 'wait'],
      generators: ['plain'],
      actors: 1,
      sprite: 'wraith',
    }),
    define({
      id: 'banshee',
      name: 'Banshee',
      tagline: 'Screams naughty strings, emoji and RTL into every field.',
      behaviour:
        'A user who enters unusual input. Fills text fields with edge-case values (special characters, emoji, right-to-left text, very long text, empty or whitespace-only values). Checks that the app validates them, shows a clear message, and neither crashes nor stores corrupted data.',
      allowedSteps: ['goto', 'click', 'fill', 'press', 'wait'],
      generators: ['naughty', 'emoji', 'rtl', 'long', 'empty', 'whitespace', 'fastcheck'],
      actors: 1,
      sprite: 'banshee',
    }),
    define({
      id: 'doppelganger',
      name: 'Doppelgänger',
      tagline: 'Two tabs, one account, racing for the same thing.',
      behaviour:
        'The same user signed in from two browser tabs at once. Both tabs perform the same action at the same moment, lined up with a barrier and held requests. Checks that the app stays consistent, for example that an item can only be claimed once.',
      allowedSteps: ['goto', 'click', 'fill', 'press', 'reload', 'wait', 'barrier', 'holdRequests', 'releaseRequests'],
      generators: ['plain'],
      actors: 2,
      sprite: 'doppelganger',
    }),
  ].map((p) => [p.id, p]),
);

const LIST: readonly Persona[] = Object.freeze(PERSONA_IDS.map((id) => PERSONAS.get(id)!));

export function isPersonaId(id: string): id is PersonaId {
  return PERSONAS.has(id as PersonaId);
}

export function getPersona(id: string): Persona {
  if (!isPersonaId(id)) throw new UnknownPersonaError(id);
  return PERSONAS.get(id)!;
}

export function listPersonas(): readonly Persona[] {
  return LIST;
}
