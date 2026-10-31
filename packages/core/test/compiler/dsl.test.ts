import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import { LlmOutputSchema, StepSchema, stepType } from '../../src/compiler/dsl.js';
import { STEP_TYPES } from '../../src/personas/index.js';

const plan = (body: Record<string, unknown>) => ({ result: { kind: 'plan', ...body } });

describe('LlmOutputSchema', () => {
  it('parses the design §6 doppelganger example body', () => {
    const out = plan({
      intent: 'Two sessions claim the same candy at the same time; only one should succeed.',
      actors: {
        a: [
          { goto: '/market' },
          { holdRequests: 'POST /api/claims' },
          { click: { role: 'button', name: 'Claim Sour Skulls' } },
          { barrier: 'fire' },
          { releaseRequests: 'POST /api/claims' },
        ],
        b: [{ goto: '/market' }, { click: { role: 'button', name: 'Claim Sour Skulls' } }, { barrier: 'fire' }],
      },
      assert: [
        { api: { method: 'GET', path: '/api/candies/sour-skulls', jsonPath: '$.claims.length', equals: 1 } },
        { noConsoleErrors: true },
      ],
    });
    expect(LlmOutputSchema.safeParse(out).success).toBe(true);
  });

  it('rejects fill with a literal input', () => {
    const step = { fill: { target: { label: 'Offer' }, input: { literal: 'x' } } };
    expect(StepSchema.safeParse(step).success).toBe(false);
  });

  it('rejects a step with two keys', () => {
    expect(StepSchema.safeParse({ click: { text: 'A' }, back: true }).success).toBe(false);
  });

  it('rejects a raw CSS target', () => {
    expect(StepSchema.safeParse({ click: { css: '#a' } }).success).toBe(false);
  });

  it('step enum matches STEP_TYPES', () => {
    const examples: Record<string, unknown> = {
      goto: { goto: '/market' },
      click: { click: { text: 'Go' } },
      dblclick: { dblclick: { testId: 'x' } },
      fill: { fill: { target: { label: 'Offer' }, input: { generator: 'naughty' } } },
      press: { press: 'Enter' },
      back: { back: true },
      reload: { reload: true },
      wait: { wait: 500 },
      throttle: { throttle: { profile: 'slow-3g' } },
      barrier: { barrier: 'fire' },
      holdRequests: { holdRequests: 'POST /api/claims' },
      releaseRequests: { releaseRequests: 'POST /api/claims' },
      login: { login: { account: 'default' } },
      logout: { logout: true },
    };
    expect(Object.keys(examples).sort()).toEqual([...STEP_TYPES].sort());
    for (const type of STEP_TYPES) {
      const parsed = StepSchema.safeParse(examples[type]);
      expect(parsed.success, type).toBe(true);
      if (parsed.success) expect(stepType(parsed.data)).toBe(type);
    }
  });

  it('accepts notApplicable with a reason', () => {
    const out = { result: { kind: 'notApplicable', reason: 'No form on these pages.' } };
    expect(LlmOutputSchema.safeParse(out).success).toBe(true);
  });

  it('zodOutputFormat accepts the schema', () => {
    const format = zodOutputFormat(LlmOutputSchema);
    expect(format.type).toBe('json_schema');
  });

  it('structured-output schema has no unsupported keywords', () => {
    const json = JSON.stringify(zodOutputFormat(LlmOutputSchema).schema);
    for (const k of ['"minimum"', '"maximum"', '"exclusiveMinimum"', '"exclusiveMaximum"', '"minLength"', '"maxLength"', '"pattern"', '"oneOf"']) {
      expect(json, k).not.toContain(k);
    }
  });
});
