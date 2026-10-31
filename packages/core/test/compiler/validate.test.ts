import { describe, expect, it } from 'vitest';
import type { PlanBody } from '../../src/compiler/dsl.js';
import { validatePlan } from '../../src/compiler/validate.js';
import { getPersona } from '../../src/personas/index.js';
import { MARKET, TRADE } from './scout-fixtures.js';

const claim = { click: { role: 'button', name: 'Claim Sour Skulls' } };

const doppel = (over: Partial<PlanBody> = {}): PlanBody => ({
  kind: 'plan',
  intent: 'Two sessions claim the same candy; only one succeeds.',
  actors: {
    a: [{ goto: '/market' }, { holdRequests: 'POST /api/claims' }, claim, { barrier: 'fire' }, { releaseRequests: 'POST /api/claims' }],
    b: [{ goto: '/market' }, claim, { barrier: 'fire' }],
  },
  assert: [{ api: { method: 'GET', path: '/api/candies/sour-skulls', jsonPath: '$.claims.length', equals: 1 } }],
  ...over,
});

const single = (steps: PlanBody['actors']['a'], over: Partial<PlanBody> = {}): PlanBody => ({
  kind: 'plan',
  intent: 'Check the page.',
  actors: { a: steps },
  assert: [{ textVisible: 'Saved' }],
  ...over,
});

const D = getPersona('doppelganger');
const W = getPersona('wraith');
const B = getPersona('banshee');
const market = { routes: [MARKET] };
const both = { routes: [MARKET, TRADE] };

describe('validatePlan', () => {
  it('valid doppelganger plan on /market has no errors', () => {
    expect(validatePlan(doppel(), { persona: D, ...market })).toEqual([]);
  });

  it('accepts every target kind Scout emitted on the picked routes', () => {
    const steps = [
      { goto: '/market' },
      { click: { testId: 'claim-sour-skulls' } },
      { click: { text: 'Claim Candy Corn' } },
      { goto: '/trade/new' },
      { fill: { target: { label: 'Offer' }, input: { generator: 'plain' as const } } },
      { click: { role: 'button', name: 'Propose trade' } },
    ];
    const errors = validatePlan(single(steps, { assert: [{ elementCount: { target: { testId: 'trade-status' }, equals: 1 } }] }), { persona: W, ...both });
    expect(errors).toEqual([]);
  });

  it('target from an unpicked route is rejected', () => {
    const steps = [{ goto: '/market' }, { click: { role: 'button', name: 'Propose trade' } }];
    expect(validatePlan(single(steps), { persona: W, ...market }).join('\n')).toMatch(/not found on the picked routes/);
  });

  it('banshee may not dblclick', () => {
    expect(validatePlan(single([{ goto: '/market' }, { dblclick: claim.click }]), { persona: B, ...market }).join('\n')).toMatch(
      /not allowed for this persona/,
    );
  });

  it('wraith may not use naughty generator', () => {
    const steps = [{ goto: '/trade/new' }, { fill: { target: { label: 'Offer' }, input: { generator: 'naughty' as const } } }];
    expect(validatePlan(single(steps), { persona: W, routes: [TRADE] }).join('\n')).toMatch(/generator "naughty" not allowed/);
  });

  it('doppelganger needs actor b', () => {
    const plan = doppel();
    plan.actors = { a: [{ goto: '/market' }, claim] };
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/needs 2 actors/);
  });

  it('a single-actor persona may not have actor b', () => {
    const plan = single([{ goto: '/market' }]);
    plan.actors.b = [{ goto: '/market' }];
    expect(validatePlan(plan, { persona: W, ...market }).join('\n')).toMatch(/needs 1 actor/);
  });

  it('barrier missing from actor b', () => {
    const plan = doppel();
    plan.actors.b = [{ goto: '/market' }, claim];
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/barrier "fire" is not reached by actor b/);
  });

  it('hold without release', () => {
    const plan = doppel();
    plan.actors.a = [{ goto: '/market' }, { holdRequests: 'POST /api/claims' }, claim, { barrier: 'fire' }];
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/never released/);
  });

  it('release before hold', () => {
    const plan = doppel();
    plan.actors.a = [{ goto: '/market' }, { releaseRequests: 'POST /api/claims' }, claim, { barrier: 'fire' }];
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/released before it was held/);
  });

  it('bad request pattern', () => {
    const plan = doppel();
    plan.actors.a = [{ goto: '/market' }, { holdRequests: 'post claims' }, claim, { barrier: 'fire' }, { releaseRequests: 'post claims' }];
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/METHOD \/path/);
  });

  it('wait 2500', () => {
    expect(validatePlan(single([{ goto: '/market' }, { wait: 2500 }]), { persona: W, ...market }).join('\n')).toMatch(/0…2000/);
  });

  it('goto /vault (not picked)', () => {
    expect(validatePlan(single([{ goto: '/vault' }]), { persona: W, ...market }).join('\n')).toMatch(/not a picked route/);
  });

  it('api path https://x.test/a', () => {
    const plan = doppel({ assert: [{ api: { method: 'GET', path: 'https://x.test/a' } }] });
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/must start with \//);
  });

  it('protocol-relative api path is rejected', () => {
    const plan = doppel({ assert: [{ api: { method: 'GET', path: '//x.test/a' } }] });
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/must start with \//);
  });

  it('empty assert', () => {
    expect(validatePlan(doppel({ assert: [] }), { persona: D, ...market }).join('\n')).toMatch(/at least one assertion/);
  });

  it('empty intent and empty actor', () => {
    const plan = single([], { intent: '  ' });
    const text = validatePlan(plan, { persona: W, ...market }).join('\n');
    expect(text).toMatch(/intent: must not be empty/);
    expect(text).toMatch(/actors\.a: needs at least one step/);
  });

  it('errors carry a path prefix', () => {
    const steps = [{ goto: '/market' }, { click: { role: 'button', name: 'Nope' } }];
    expect(validatePlan(single(steps), { persona: W, ...market })).toContainEqual(expect.stringMatching(/^actors\.a\[1\]\.click: /));
  });

  it('api status must be an HTTP status', () => {
    const plan = doppel({ assert: [{ api: { method: 'GET', path: '/a', status: 42 } }] });
    expect(validatePlan(plan, { persona: D, ...market }).join('\n')).toMatch(/100…599/);
  });
});
