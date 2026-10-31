import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { CompilerError } from '../../src/compiler/errors.js';
import { createAnthropicClient, type LlmRequest } from '../../src/compiler/llm.js';

const req: LlmRequest = {
  model: 'claude-sonnet-5-5',
  system: 'SYS',
  turns: [
    { role: 'user', text: 'first' },
    { role: 'assistant', raw: [{ type: 'text', text: '{"bad":1}' }] },
    { role: 'user', text: 'fix it' },
  ],
  meta: { criterion: '3.2', persona: 'wraith', attempt: 2 },
};

const stub = (impl: (...args: unknown[]) => unknown) => {
  const create = vi.fn(impl);
  return { create, client: createAnthropicClient({ anthropic: { messages: { create } } as unknown as Pick<Anthropic, 'messages'> }) };
};

const message = (over: Record<string, unknown>) => ({
  content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '{"result":' }, { type: 'text', text: '1}' }],
  stop_reason: 'end_turn',
  stop_details: null,
  ...over,
});

describe('createAnthropicClient', () => {
  it('sends system, mapped turns, model and json output format', async () => {
    const { create, client } = stub(async () => message({}));
    await client.complete(req);
    const body = create.mock.calls[0]![0] as Record<string, unknown> & { output_config: { format: Record<string, unknown> } };
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.system).toBe('SYS');
    expect(body.max_tokens).toBe(16000);
    expect(body.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: [{ type: 'text', text: '{"bad":1}' }] },
      { role: 'user', content: 'fix it' },
    ]);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema).toBeTypeOf('object');
    expect(body.output_config.format).not.toHaveProperty('parse');
    expect(body).not.toHaveProperty('meta');
  });

  it('returns text, stop reason and raw content', async () => {
    const m = message({ stop_reason: 'max_tokens' });
    const { client } = stub(async () => m);
    expect(await client.complete(req)).toEqual({ kind: 'output', text: '{"result":1}', stopReason: 'max_tokens', raw: m.content });
  });

  it('maps refusal', async () => {
    const { client } = stub(async () => message({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'x' } }));
    expect(await client.complete(req)).toEqual({ kind: 'refusal', detail: 'cyber' });
  });

  it('maps refusal without details', async () => {
    const { client } = stub(async () => message({ stop_reason: 'refusal', stop_details: null }));
    expect(await client.complete(req)).toEqual({ kind: 'refusal', detail: 'refused' });
  });

  it('auth error → CompilerError', async () => {
    const { client } = stub(async () => {
      throw new Anthropic.AuthenticationError(401, { type: 'authentication_error' }, 'invalid x-api-key', new Headers());
    });
    await expect(client.complete(req)).rejects.toBeInstanceOf(CompilerError);
  });

  it('permission error → CompilerError', async () => {
    const { client } = stub(async () => {
      throw new Anthropic.PermissionDeniedError(403, {}, 'denied', new Headers());
    });
    await expect(client.complete(req)).rejects.toMatchObject({ name: 'CompilerError', kind: 'auth', exitCode: 2 });
  });

  it('other errors pass through', async () => {
    const boom = new Anthropic.RateLimitError(429, {}, 'slow down', new Headers());
    const { client } = stub(async () => {
      throw boom;
    });
    await expect(client.complete(req)).rejects.toBe(boom);
  });
});
