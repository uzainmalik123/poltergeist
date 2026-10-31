import { describe, expect, it } from 'vitest';
import { classifyEars } from '../../src/spec/index.js';

describe('classifyEars', () => {
  it.each([
    [
      'WHEN the user clicks Buy, THE Cart SHALL add the item.',
      { kind: 'event', trigger: 'the user clicks Buy', subject: 'Cart', response: 'add the item.' },
    ],
    [
      'IF the token is stale, THEN THE Server SHALL reject it.',
      { kind: 'unwanted', trigger: 'the token is stale', subject: 'Server', response: 'reject it.' },
    ],
    [
      'WHILE a run is in progress, THE Network_Guard SHALL block it.',
      { kind: 'state', precondition: 'a run is in progress', subject: 'Network_Guard', response: 'block it.' },
    ],
    [
      'WHERE dark mode is on, THE UI SHALL dim.',
      { kind: 'optional', precondition: 'dark mode is on', subject: 'UI', response: 'dim.' },
    ],
    [
      'THE Spec_Reader SHALL classify EARS kinds.',
      { kind: 'ubiquitous', subject: 'Spec_Reader', response: 'classify EARS kinds.' },
    ],
    [
      'When the user saves, the editor shall persist.',
      { kind: 'event', trigger: 'the user saves', subject: 'editor', response: 'persist.' },
    ],
    [
      'the server shall drop requests when idle.',
      { kind: 'ubiquitous', subject: 'server', response: 'drop requests when idle.' },
    ],
    [
      'THE Proxy SHALL forward the IF-Match header.',
      { kind: 'ubiquitous', subject: 'Proxy', response: 'forward the IF-Match header.' },
    ],
    [
      'Send IF-Match, THE Proxy SHALL reject.',
      { kind: 'ubiquitous', subject: 'Proxy', response: 'reject.' },
    ],
    [
      'WHEN a, IF b, THE X SHALL y.',
      { kind: 'unwanted', trigger: 'a; b', subject: 'X', response: 'y.' },
    ],
    [
      'THE A SHALL b and SHALL c.',
      { kind: 'ubiquitous', subject: 'A', response: 'b and SHALL c.' },
    ],
  ])('%s', (text, ears) => {
    expect(classifyEars(text)).toEqual({ kind: ears.kind, ears });
  });

  it('returns freeform with no SHALL', () => {
    expect(classifyEars('The page should load fast.')).toEqual({ kind: 'freeform', ears: null });
  });

  it('does not treat "shall" inside a word as SHALL', () => {
    expect(classifyEars('Marshall the data.')).toEqual({ kind: 'freeform', ears: null });
  });
});
