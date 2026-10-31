import { mix32, pickIndex } from './mix.js';

const WORDS = Object.freeze([
  'apple', 'maple', 'river', 'stone', 'cedar', 'amber', 'lemon', 'otter',
  'pearl', 'tulip', 'cobalt', 'willow', 'harbor', 'meadow', 'copper', 'violet',
]);

const EMOJI = Object.freeze([
  '😀',
  '👍🏽',
  '👨\u200D👩\u200D👧\u200D👦',
  '🏳\uFE0F\u200D🌈',
  '🇯🇵',
  '❤\uFE0F',
  '1\uFE0F\u20E3',
  '🧑🏿\u200D💻',
  '🍬 Sour Candy 🍭',
  '🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃',
  'hello 👋 world',
  '👩🏻\u200D❤\uFE0F\u200D💋\u200D👨🏾',
]);

const RTL = Object.freeze([
  'مرحبا بالعالم',
  'שלום עולם',
  'Hello שלום 123',
  'Order #42 للبيع',
  '\u202Etxt.exe',
  '١٢٣٤٥',
  'abc\u200Fdef\u200Eghi',
  '\u2067עברית\u2069 and English',
]);

const WHITESPACE = Object.freeze([
  ' ', '   ', '\t', '\n', '\r\n', '\u00A0', '\u200B', '\u3000', '\u2028', ' \t\n ',
]);

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LONG_LENGTH = 10_000;

export function pick(list: readonly string[], seed: number, index: number): string {
  return list[pickIndex(list.length, seed, index)]!;
}

export const plain = (seed: number, index: number): string =>
  pick(WORDS, seed, index) + String(1000 + (mix32((seed ^ mix32(index)) >>> 0) % 9000));

export const emoji = (seed: number, index: number): string => pick(EMOJI, seed, index);

export const rtl = (seed: number, index: number): string => pick(RTL, seed, index);

export const whitespace = (seed: number, index: number): string => pick(WHITESPACE, seed, index);

export const empty = (): string => '';

export function long(seed: number, index: number): string {
  const r = pickIndex(ALNUM.length, seed, index);
  const rotated = ALNUM.slice(r) + ALNUM.slice(0, r);
  return rotated.repeat(Math.ceil(LONG_LENGTH / rotated.length)).slice(0, LONG_LENGTH);
}
