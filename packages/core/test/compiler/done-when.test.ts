import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import type { LlmRequest, LlmResponse } from '../../src/compiler/llm.js';
import { parseConfig } from '../../src/config/load.js';
import { guardLaunchOptions } from '../../src/safety/guard.js';
import { scout } from '../../src/scout/scout.js';
import type { ScoutResult } from '../../src/scout/types.js';
import { parseSpec } from '../../src/spec/read.js';
import type { Criterion } from '../../src/spec/types.js';
import { PASSWORD, USER, startCandyFixture, type CandyFixture } from '../scout/candy-fixture.js';
import { fakeLlm, output } from './fake-llm.js';

const SPEC_DIR = fileURLToPath(new URL('../fixtures/spec/candy-fixture/', import.meta.url));

type Element = { role: string; name: string; label?: string; testId?: string };

/** Stands in for the model: answers only with targets that appear in the prompt's page data. */
function scripted(req: LlmRequest): LlmResponse {
  const prompt = (req.turns[0] as { text: string }).text;
  const path = /^Page (\S+)/m.exec(prompt)![1]!;
  const elements = JSON.parse(/^Elements: (.*)$/m.exec(prompt)![1]!) as { interactive: Element[] };
  const button = elements.interactive.find((e) => e.role === 'button');
  const field = elements.interactive.find((e) => e.role === 'textbox' && e.label);
  if (!button) return output({ result: { kind: 'notApplicable', reason: 'There is no button on this page.' } });
  const click = { click: { role: 'button', name: button.name } };
  const assert = [{ api: { method: 'GET', path: '/api/state' } }, { noConsoleErrors: true }];
  switch (req.meta.persona) {
    case 'wraith':
      return output({ result: { kind: 'plan', intent: 'Double-click the main action.', actors: { a: [{ goto: path }, { dblclick: click.click }] }, assert } });
    case 'banshee':
      if (!field) return output({ result: { kind: 'notApplicable', reason: 'There are no text fields on this page.' } });
      return output({
        result: {
          kind: 'plan',
          intent: 'Submit edge-case text.',
          actors: { a: [{ goto: path }, { fill: { target: { label: field.label }, input: { generator: 'naughty' } } }, click] },
          assert,
        },
      });
    case 'doppelganger':
      return output({
        result: {
          kind: 'plan',
          intent: 'Two tabs act at once.',
          actors: { a: [{ goto: path }, { barrier: 'go' }, click], b: [{ goto: path }, { barrier: 'go' }, click] },
          assert,
        },
      });
  }
}

let browser: Browser;
let fixture: CandyFixture;
let outDir: string;
let scouted: ScoutResult;
let criteria: Criterion[];

beforeAll(async () => {
  fixture = await startCandyFixture();
  browser = await chromium.launch(guardLaunchOptions());
  outDir = await mkdtemp(join(tmpdir(), 'compile-done-'));
  const loaded = parseConfig(
    {
      target: fixture.origin,
      routes: [
        { path: '/', auth: false },
        { path: '/market', auth: true },
        { path: '/trade/new', auth: true },
      ],
      accounts: { default: { loginRoute: '/login', username: USER, password: 'env:GHOST_PASS' } },
    },
    { configPath: join(tmpdir(), 'poltergeist.config.json'), env: { GHOST_PASS: PASSWORD } },
  );
  scouted = await scout(browser, loaded, { outDir: join(outDir, 'scout'), routeTimeoutMs: 3000 });
  ({ criteria } = await parseSpec(SPEC_DIR));
}, 60000);

afterAll(async () => {
  await browser?.close();
  await fixture?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

describe('compile (Done when, on the Candy fixture, D-32)', () => {
  it('≥ 80% valid or justified notApplicable, and a second run makes zero LLM calls', async () => {
    expect(criteria).toHaveLength(5);
    const cacheDir = join(outDir, 'cache');
    const first = await compile(criteria, scouted, { client: fakeLlm(scripted).client, model: 'claude-sonnet-5-5', cacheDir, outDir });
    expect(first.pairs).toHaveLength(15);
    const good = first.pairs.filter((p) => p.status === 'compiled' || p.status === 'notApplicable');
    const bad = first.pairs.filter((p) => p.status === 'uncompilable');
    expect(good.length / first.pairs.length, JSON.stringify(bad, null, 2)).toBeGreaterThanOrEqual(0.8);

    const again = fakeLlm(scripted);
    const second = await compile(criteria, scouted, { client: again.client, model: 'claude-sonnet-5-5', cacheDir });
    expect(again.calls).toHaveLength(0);
    expect(second.llmCalls).toBe(0);
    expect(second.cacheHits).toBe(good.length);
  });
});
