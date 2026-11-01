import type { PairVerdict } from '../verdicts/types.js';

/** THEME §4 verdict glyphs: pure ASCII, so they work in markdown and terminals. F26 owns them (KI-40). */
export const VERDICT_GLYPHS: Readonly<Record<PairVerdict | 'notRun', string>> = Object.freeze({
  haunted: '[!!]',
  flaky: '[~~]',
  inconclusive: '[??]',
  uncompilable: '[??]',
  clean: '[ok]',
  notApplicable: '[--]',
  notRun: '[  ]',
});

/** THEME §4's draft wordmark, used until F26's Costume Kit passes its own (KI-40). */
export const DRAFT_WORDMARK = [
  ' ╔═╗╔═╗╦  ╔╦╗╔═╗╦═╗╔═╗╔═╗╦╔═╗╔╦╗',
  ' ╠═╝║ ║║   ║ ║╣ ╠╦╝║ ╦║╣ ║╚═╗ ║',
  ' ╩  ╚═╝╩═╝ ╩ ╚═╝╩╚═╚═╝╚═╝╩╚═╝ ╩',
  '        your spec, haunted.',
].join('\n');
