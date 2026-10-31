import { describe, expect, it } from 'vitest';
import {
  GENERATOR_IDS,
  PERSONA_IDS,
  STEP_TYPES,
  UnknownPersonaError,
  getPersona,
  isPersonaId,
  listPersonas,
} from '../../src/personas/index.js';

const THEME_WORDS = [
  'ghost', 'haunt', 'spirit', 'spook', 'poltergeist', 'wraith', 'banshee', 'doppel', 'lich',
  'revenant', 'changeling', 'possess', 'exorcis', 'seance', 'séance', 'curse', 'undead',
];

describe('STEP_TYPES', () => {
  it('is the 14-step DSL vocabulary, frozen', () => {
    expect(STEP_TYPES).toEqual([
      'goto', 'click', 'dblclick', 'fill', 'press', 'back', 'reload', 'wait', 'throttle',
      'barrier', 'holdRequests', 'releaseRequests', 'login', 'logout',
    ]);
    expect(Object.isFrozen(STEP_TYPES)).toBe(true);
  });
});

describe('listPersonas', () => {
  it('lists the three core personas in order', () => {
    expect(listPersonas().map((p) => p.id)).toEqual(['wraith', 'banshee', 'doppelganger']);
    expect(listPersonas().map((p) => p.name)).toEqual(['Wraith', 'Banshee', 'Doppelgänger']);
    expect(PERSONA_IDS).toEqual(['wraith', 'banshee', 'doppelganger']);
  });

  it('uses the persona id as the sprite reference', () => {
    for (const p of listPersonas()) expect(p.sprite).toBe(p.id);
  });
});

describe('allocations', () => {
  it('wraith', () => {
    const p = getPersona('wraith');
    expect(p.allowedSteps).toEqual(['goto', 'click', 'dblclick', 'fill', 'press', 'back', 'reload', 'wait']);
    expect(p.generators).toEqual(['plain']);
    expect(p.actors).toBe(1);
  });

  it('banshee', () => {
    const p = getPersona('banshee');
    expect(p.allowedSteps).toEqual(['goto', 'click', 'fill', 'press', 'wait']);
    expect(p.generators).toEqual(['naughty', 'emoji', 'rtl', 'long', 'empty', 'whitespace', 'fastcheck']);
    expect(p.actors).toBe(1);
  });

  it('doppelganger', () => {
    const p = getPersona('doppelganger');
    expect(p.allowedSteps).toEqual([
      'goto', 'click', 'fill', 'press', 'reload', 'wait', 'barrier', 'holdRequests', 'releaseRequests',
    ]);
    expect(p.generators).toEqual(['plain']);
    expect(p.actors).toBe(2);
  });
});

describe('integrity', () => {
  it('steps and generators exist, without duplicates', () => {
    for (const p of listPersonas()) {
      for (const s of p.allowedSteps) expect(STEP_TYPES).toContain(s);
      for (const g of p.generators) expect(GENERATOR_IDS).toContain(g);
      expect(new Set(p.allowedSteps).size).toBe(p.allowedSteps.length);
      expect(new Set(p.generators).size).toBe(p.generators.length);
    }
    const ids = listPersonas().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves throttle, login and logout to the extended personas (F16)', () => {
    for (const p of listPersonas()) {
      for (const s of ['throttle', 'login', 'logout'] as const) expect(p.allowedSteps).not.toContain(s);
    }
  });
});

describe('text fields', () => {
  it('tagline is one short line', () => {
    for (const p of listPersonas()) {
      expect(p.tagline.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeLessThanOrEqual(80);
      expect(p.tagline).not.toMatch(/\n/);
    }
  });

  it('behaviour is plain QA wording with no theme words (D-09)', () => {
    for (const p of listPersonas()) {
      expect(p.behaviour.length).toBeGreaterThanOrEqual(80);
      const lower = p.behaviour.toLowerCase();
      for (const w of THEME_WORDS) expect(lower).not.toContain(w);
    }
  });
});

describe('getPersona', () => {
  it.each(['Wraith', '__proto__', 'toString', 'lich', ''])('unknown id %j throws UnknownPersonaError', (id) => {
    expect(() => getPersona(id)).toThrow(UnknownPersonaError);
    try {
      getPersona(id);
    } catch (e) {
      expect((e as UnknownPersonaError).id).toBe(id);
    }
  });

  it('isPersonaId only accepts built-in ids', () => {
    expect(isPersonaId('banshee')).toBe(true);
    expect(isPersonaId('constructor')).toBe(false);
  });

  it('returns frozen data that callers cannot change', () => {
    const p = getPersona('wraith');
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.allowedSteps)).toBe(true);
    expect(Object.isFrozen(p.generators)).toBe(true);
    expect(() => (p.allowedSteps as string[]).push('login')).toThrow(TypeError);
    expect(getPersona('wraith').allowedSteps).not.toContain('login');
  });
});
