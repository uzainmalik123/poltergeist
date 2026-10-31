import { UnknownGeneratorError } from '../errors.js';
import { emoji, empty, long, plain, rtl, whitespace } from './lists.js';
import { assertUint32 } from './mix.js';
import { naughty } from './naughty.js';

/** Built-in input generators. The LLM only ever picks one of these ids, never a value (D-04). */
export const GENERATOR_IDS = Object.freeze([
  'plain', 'naughty', 'emoji', 'rtl', 'long', 'empty', 'whitespace', 'fastcheck',
] as const);

export type GeneratorId = (typeof GENERATOR_IDS)[number];

export type GeneratorInfo = { readonly id: GeneratorId; readonly description: string };

type Generator = (seed: number, index: number) => string;

const notImplemented: Generator = () => {
  throw new Error('not implemented');
};

/** Descriptions are shown to the LLM, so they use plain QA wording (D-09). */
const GENERATORS: ReadonlyMap<GeneratorId, { description: string; fn: Generator }> = new Map([
  ['plain', { description: 'Short ordinary alphanumeric text, for filling a field with a valid everyday value.', fn: plain }],
  ['naughty', { description: 'Strings known to break input handling: reserved words, numeric-looking text, special and control characters, unusual Unicode.', fn: naughty }],
  ['emoji', { description: 'Emoji, including multi-codepoint sequences, skin tones, flags and keycaps.', fn: emoji }],
  ['rtl', { description: 'Right-to-left text (Arabic, Hebrew), mixed-direction text and direction override characters.', fn: rtl }],
  ['long', { description: 'A 10,000-character string, for length limits and layout overflow.', fn: long }],
  ['empty', { description: 'An empty string.', fn: empty }],
  ['whitespace', { description: 'Whitespace-only values, including tabs, newlines, non-breaking and zero-width spaces.', fn: whitespace }],
  ['fastcheck', { description: 'A random but reproducible Unicode string of up to 64 characters.', fn: notImplemented }],
]);

const INFO: readonly GeneratorInfo[] = Object.freeze(
  GENERATOR_IDS.map((id) => Object.freeze({ id, description: GENERATORS.get(id)!.description })),
);

export function isGeneratorId(id: string): id is GeneratorId {
  return GENERATORS.has(id as GeneratorId);
}

export function listGenerators(): readonly GeneratorInfo[] {
  return INFO;
}

/** The same (id, seed, index) always gives the same value (Req 4.2). Seed and index are uint32 (D-30). */
export function generate(id: string, seed: number, index: number): string {
  assertUint32('seed', seed);
  assertUint32('index', index);
  if (!isGeneratorId(id)) throw new UnknownGeneratorError(id);
  return GENERATORS.get(id)!.fn(seed, index);
}
