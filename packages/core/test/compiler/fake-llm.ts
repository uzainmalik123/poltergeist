import type { LlmClient, LlmRequest, LlmResponse } from '../../src/compiler/llm.js';
import type { PersonaId } from '../../src/personas/index.js';

export type FakeLlm = { client: LlmClient; calls: LlmRequest[]; readonly maxInFlight: number };

export function fakeLlm(responder: (req: LlmRequest) => LlmResponse | Promise<LlmResponse>): FakeLlm {
  const calls: LlmRequest[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  return {
    calls,
    get maxInFlight() {
      return maxInFlight;
    },
    client: {
      async complete(req) {
        calls.push(structuredClone(req));
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          return await responder(req);
        } finally {
          inFlight--;
        }
      },
    },
  };
}

export const output = (value: unknown, stopReason: string | null = 'end_turn'): LlmResponse => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return { kind: 'output', text, stopReason, raw: [{ type: 'text', text }] };
};

const claim = { click: { role: 'button', name: 'Claim Sour Skulls' } };

/** A valid plan body on the `/market` fixture route for each persona. */
export const VALID: Record<PersonaId, unknown> = {
  wraith: {
    result: {
      kind: 'plan',
      intent: 'Double-click claim; only one claim is made.',
      actors: { a: [{ goto: '/market' }, { dblclick: { testId: 'claim-sour-skulls' } }] },
      assert: [{ api: { method: 'GET', path: '/api/claims', jsonPath: '$.length', equals: 1 } }],
    },
  },
  banshee: { result: { kind: 'notApplicable', reason: 'There are no text fields on the market page.' } },
  doppelganger: {
    result: {
      kind: 'plan',
      intent: 'Two tabs claim at once; only one succeeds.',
      actors: { a: [{ goto: '/market' }, claim, { barrier: 'go' }], b: [{ goto: '/market' }, claim, { barrier: 'go' }] },
      assert: [{ textVisible: '2 candies left' }],
    },
  },
};

export const INVALID = {
  result: { kind: 'plan', intent: 'x', actors: { a: [{ goto: '/nowhere' }] }, assert: [] },
};
