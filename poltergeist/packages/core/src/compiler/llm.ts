import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { PersonaId } from '../personas/registry.js';
import { LlmOutputSchema } from './dsl.js';
import { CompilerError } from './errors.js';

/** `raw` is the provider's own assistant content, replayed unchanged so a retry stays append-only. */
export type LlmTurn = { role: 'user'; text: string } | { role: 'assistant'; raw: unknown };

export type LlmRequest = {
  model: string;
  system: string;
  turns: LlmTurn[];
  /** For fakes and logs only; never sent to the provider. */
  meta: { criterion: string; persona: PersonaId; attempt: 1 | 2 };
  /** Cancels the request (Ctrl-C). */
  signal?: AbortSignal;
};

export type LlmResponse =
  | { kind: 'output'; text: string; stopReason: string | null; raw: unknown }
  | { kind: 'refusal'; detail: string };

/** The compiler's only view of an LLM (D-32). Anthropic now, Bedrock in F19, fakes in tests. */
export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

const DEFAULT_MAX_TOKENS = 16000;

/**
 * Structured output via `messages.create` (not `parse`, which throws on a schema mismatch and
 * would lose the text the retry replays). Our own validation always re-runs on the text.
 */
export function createAnthropicClient(opts: { anthropic?: Pick<Anthropic, 'messages'>; maxTokens?: number } = {}): LlmClient {
  let anthropic = opts.anthropic;
  const { type, schema } = zodOutputFormat(LlmOutputSchema);
  return {
    async complete(req) {
      anthropic ??= new Anthropic();
      let message: Anthropic.Message;
      try {
        const body: Anthropic.MessageCreateParamsNonStreaming = {
          model: req.model,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: req.system,
          messages: req.turns.map(
            (t): Anthropic.MessageParam =>
              t.role === 'user' ? { role: 'user', content: t.text } : { role: 'assistant', content: t.raw as Anthropic.ContentBlockParam[] },
          ),
          output_config: { format: { type, schema } },
        };
        message = await (req.signal ? anthropic.messages.create(body, { signal: req.signal }) : anthropic.messages.create(body));
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          throw new CompilerError(`The LLM provider rejected the credentials (HTTP ${err.status}).`, { cause: err });
        }
        // Anything that isn't an SDK error was raised while setting up the request, e.g. no credentials.
        if (!(err instanceof Anthropic.AnthropicError)) {
          const message = err instanceof Error ? err.message : String(err);
          throw new CompilerError(`The LLM client could not be set up: ${message}`, { cause: err });
        }
        throw err;
      }
      if (message.stop_reason === 'refusal') {
        return { kind: 'refusal', detail: message.stop_details?.category ?? 'refused' };
      }
      const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return { kind: 'output', text, stopReason: message.stop_reason, raw: message.content };
    },
  };
}
