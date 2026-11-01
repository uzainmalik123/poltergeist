import { describe, expect, it } from 'vitest';
import { PROMPT_VERSION, SYSTEM_PROMPT, buildRetryPrompt, buildUserPrompt } from '../../src/compiler/prompt.js';
import { listPersonas } from '../../src/personas/index.js';
import { THEME_WORDS } from '../helpers/theme-words.js';
import { criterion } from './criteria.js';
import { MARKET } from './scout-fixtures.js';

const C = criterion('3.2', 'WHEN two sessions claim Sour Skulls at once, THE Market SHALL accept only one claim.');

describe('prompt', () => {
  it('has a version constant', () => {
    expect(PROMPT_VERSION).toBe('f05-1');
  });

  it('prompt has no theme words, persona ids or names', () => {
    for (const p of listPersonas()) {
      const text = (SYSTEM_PROMPT + '\n' + buildUserPrompt(C, p, [MARKET])).toLowerCase();
      for (const w of THEME_WORDS) expect(text, `${p.id}: ${w}`).not.toContain(w);
      expect(text).not.toContain(p.id);
      expect(text).not.toContain(p.name.toLowerCase());
    }
  });

  it("user prompt lists only the persona's steps and generators", () => {
    const banshee = listPersonas().find((p) => p.id === 'banshee')!;
    const text = buildUserPrompt(C, banshee, [MARKET]);
    expect(text).toContain('naughty');
    expect(text).not.toContain('dblclick');
    expect(text).not.toContain('holdRequests');
  });

  it('user prompt says how many actors to write', () => {
    const [wraith, , doppel] = listPersonas();
    expect(buildUserPrompt(C, wraith!, [MARKET])).toMatch(/one actor/i);
    expect(buildUserPrompt(C, doppel!, [MARKET])).toMatch(/two actors/i);
  });

  it('user prompt includes the criterion id, text and the route snapshot', () => {
    const text = buildUserPrompt(C, listPersonas()[0]!, [MARKET]);
    expect(text).toContain('3.2');
    expect(text).toContain(C.text);
    expect(text).toContain('/market');
    expect(text).toContain(MARKET.snapshot);
    expect(text).toContain('claim-sour-skulls');
  });

  it('user prompt includes EARS clauses when present', () => {
    const c = { ...C, kind: 'event' as const, ears: { kind: 'event' as const, trigger: 'two sessions claim Sour Skulls at once', response: 'accept only one claim' } };
    expect(buildUserPrompt(c, listPersonas()[0]!, [MARKET])).toContain('accept only one claim');
  });

  it('retry prompt lists each error', () => {
    const text = buildRetryPrompt(['actors.a[1].click: not found', 'assert: needs at least one assertion']);
    expect(text).toContain('actors.a[1].click: not found');
    expect(text).toContain('assert: needs at least one assertion');
  });

  it("system prompt says the app is the user's own", () => {
    expect(SYSTEM_PROMPT).toMatch(/own/);
    expect(SYSTEM_PROMPT).toMatch(/notApplicable/);
  });
});
