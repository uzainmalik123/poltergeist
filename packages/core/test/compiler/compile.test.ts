import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile, type CompileOptions } from '../../src/compiler/compile.js';
import { CompilerError } from '../../src/compiler/errors.js';
import { UnknownPersonaError } from '../../src/personas/index.js';
import { criterion } from './criteria.js';
import { INVALID, VALID, fakeLlm, output, type FakeLlm } from './fake-llm.js';
import { HOME_DOWN, MARKET, TRADE } from './scout-fixtures.js';

const SCOUT = { routes: [HOME_DOWN, MARKET, TRADE] };
const CLAIM = criterion('3.2', 'WHEN two sessions claim Sour Skulls at once, THE Market SHALL accept only one claim.');
const NOWHERE = criterion('9.1', 'THE Billing SHALL invoice monthly.');

const valid = () => fakeLlm((req) => output(VALID[req.meta.persona]));

async function run(fake: FakeLlm, criteria = [CLAIM], over: Partial<CompileOptions> = {}) {
  const cacheDir = over.cacheDir ?? (await mkdtemp(join(tmpdir(), 'compile-cache-')));
  return compile(criteria, SCOUT, { client: fake.client, model: 'claude-sonnet-5-5', cacheDir, ...over });
}

describe('compile', () => {
  it('compiles a valid plan on the first try', async () => {
    const res = await run(valid(), [CLAIM], { personas: ['wraith'] });
    expect(res.pairs).toHaveLength(1);
    const p = res.pairs[0]!;
    expect(p).toMatchObject({ status: 'compiled', criterion: '3.2', persona: 'wraith', cached: false, attempts: 1 });
    if (p.status !== 'compiled') throw new Error('not compiled');
    expect(p.plan.routes).toEqual([{ path: '/market', identity: 'default' }]);
    expect(p.plan.persona).toBe('wraith');
    expect(p.plan.criterion).toBe('3.2');
    expect(res.llmCalls).toBe(1);
  });

  it('sends the system prompt, the user prompt and meta', async () => {
    const fake = valid();
    await run(fake, [CLAIM], { personas: ['wraith'] });
    const req = fake.calls[0]!;
    expect(req.model).toBe('claude-sonnet-5-5');
    expect(req.system).toMatch(/own/);
    expect(req.turns).toHaveLength(1);
    expect(req.turns[0]).toMatchObject({ role: 'user' });
    expect(req.meta).toEqual({ criterion: '3.2', persona: 'wraith', attempt: 1 });
  });

  it('retries once with errors, then succeeds', async () => {
    const fake = fakeLlm((req) => output(req.meta.attempt === 1 ? INVALID : VALID.wraith));
    const res = await run(fake, [CLAIM], { personas: ['wraith'] });
    expect(res.pairs[0]).toMatchObject({ status: 'compiled', attempts: 2 });
    const turns = fake.calls[1]!.turns;
    expect(turns).toHaveLength(3);
    expect(turns[1]).toEqual({ role: 'assistant', raw: [{ type: 'text', text: JSON.stringify(INVALID) }] });
    expect(turns[2]).toMatchObject({ role: 'user', text: expect.stringContaining('not a picked route') });
    expect(fake.calls[1]!.meta.attempt).toBe(2);
  });

  it('uncompilable after two invalid answers', async () => {
    const fake = fakeLlm(() => output(INVALID));
    const res = await run(fake, [CLAIM], { personas: ['wraith'] });
    const p = res.pairs[0]!;
    expect(p).toMatchObject({ status: 'uncompilable', reason: 'invalid plan after retry', attempts: 2 });
    if (p.status !== 'uncompilable') throw new Error();
    expect(p.errors.length).toBeGreaterThan(0);
    expect(fake.calls).toHaveLength(2);
  });

  it('non-JSON output triggers the retry', async () => {
    const fake = fakeLlm((req) => output(req.meta.attempt === 1 ? 'Here is the plan: {' : VALID.wraith));
    const res = await run(fake, [CLAIM], { personas: ['wraith'] });
    expect(res.pairs[0]).toMatchObject({ status: 'compiled', attempts: 2 });
    expect(fake.calls[1]!.turns[2]).toMatchObject({ text: expect.stringContaining('not valid JSON') });
  });

  it('max_tokens output triggers the retry even when it parses', async () => {
    const fake = fakeLlm((req) => output(VALID.wraith, req.meta.attempt === 1 ? 'max_tokens' : 'end_turn'));
    const res = await run(fake, [CLAIM], { personas: ['wraith'] });
    expect(res.pairs[0]).toMatchObject({ status: 'compiled', attempts: 2 });
  });

  it('schema errors are fed back with their path', async () => {
    const fake = fakeLlm((req) => output(req.meta.attempt === 1 ? { result: { kind: 'plan' } } : VALID.wraith));
    await run(fake, [CLAIM], { personas: ['wraith'] });
    expect(fake.calls[1]!.turns[2]).toMatchObject({ text: expect.stringContaining('result.intent') });
  });

  it('accepts notApplicable with a reason', async () => {
    const res = await run(valid(), [CLAIM], { personas: ['banshee'] });
    expect(res.pairs[0]).toMatchObject({
      status: 'notApplicable',
      reason: 'There are no text fields on the market page.',
      routes: [{ path: '/market', identity: 'default' }],
      attempts: 1,
    });
  });

  it('notApplicable with an empty reason is retried', async () => {
    const fake = fakeLlm((req) => output(req.meta.attempt === 1 ? { result: { kind: 'notApplicable', reason: ' ' } } : VALID.banshee));
    const res = await run(fake, [CLAIM], { personas: ['banshee'] });
    expect(res.pairs[0]).toMatchObject({ status: 'notApplicable', attempts: 2 });
  });

  it('refusal → uncompilable without retry', async () => {
    const fake = fakeLlm(() => ({ kind: 'refusal', detail: 'cyber' }));
    const res = await run(fake, [CLAIM], { personas: ['wraith'] });
    expect(res.pairs[0]).toMatchObject({ status: 'uncompilable', reason: 'refused: cyber', attempts: 1 });
    expect(fake.calls).toHaveLength(1);
  });

  it('network error → uncompilable "llm error"', async () => {
    const fake = fakeLlm(() => {
      throw new Error('socket hang up');
    });
    const res = await run(fake, [CLAIM], { personas: ['wraith'] });
    expect(res.pairs[0]).toMatchObject({ status: 'uncompilable', reason: 'llm error: socket hang up', attempts: 1 });
  });

  it('CompilerError rejects compile', async () => {
    const fake = fakeLlm(() => {
      throw new CompilerError('bad key');
    });
    await expect(run(fake)).rejects.toBeInstanceOf(CompilerError);
  });

  it('no matching route → uncompilable with zero calls', async () => {
    const fake = valid();
    const res = await run(fake, [NOWHERE]);
    expect(res.pairs).toHaveLength(3);
    for (const p of res.pairs) expect(p).toMatchObject({ status: 'uncompilable', reason: 'no matching route', attempts: 0 });
    expect(fake.calls).toHaveLength(0);
  });

  it('second run is all cache hits with zero calls', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'compile-cache-'));
    const first = await run(valid(), [CLAIM], { cacheDir });
    expect(first.llmCalls).toBe(3);
    expect(first.cacheHits).toBe(0);
    const fake = valid();
    const second = await run(fake, [CLAIM], { cacheDir });
    expect(fake.calls).toHaveLength(0);
    expect(second.llmCalls).toBe(0);
    expect(second.cacheHits).toBe(3);
    for (const p of second.pairs) expect(p).toMatchObject({ cached: true, attempts: 0 });
    expect(second.pairs.map((p) => p.status)).toEqual(first.pairs.map((p) => p.status));
  });

  it('a different model misses the cache', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'compile-cache-'));
    await run(valid(), [CLAIM], { cacheDir, personas: ['wraith'] });
    const fake = valid();
    await run(fake, [CLAIM], { cacheDir, personas: ['wraith'], model: 'claude-opus-5-5' });
    expect(fake.calls).toHaveLength(1);
  });

  it('uncompilable is not cached', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'compile-cache-'));
    await run(fakeLlm(() => output(INVALID)), [CLAIM], { cacheDir, personas: ['wraith'] });
    const fake = valid();
    const res = await run(fake, [CLAIM], { cacheDir, personas: ['wraith'] });
    expect(fake.calls).toHaveLength(1);
    expect(res.pairs[0]).toMatchObject({ status: 'compiled' });
  });

  it('never more than 4 calls in flight', async () => {
    const criteria = Array.from({ length: 6 }, (_, i) => criterion(`5.${i + 1}`, `THE Market SHALL let a user claim Sour Skulls, case ${i}.`));
    const fake = fakeLlm(async (req) => {
      await new Promise((r) => setTimeout(r, 5));
      return output(VALID[req.meta.persona]);
    });
    const res = await run(fake, criteria);
    expect(res.pairs).toHaveLength(18);
    expect(fake.maxInFlight).toBeLessThanOrEqual(4);
    expect(fake.maxInFlight).toBeGreaterThan(1);
  });

  it('concurrency outside 1…4 throws RangeError', async () => {
    await expect(run(valid(), [CLAIM], { concurrency: 5 })).rejects.toBeInstanceOf(RangeError);
    await expect(run(valid(), [CLAIM], { concurrency: 0 })).rejects.toBeInstanceOf(RangeError);
  });

  it('unknown persona id throws before any call', async () => {
    for (const id of ['Wraith', '__proto__']) {
      const fake = valid();
      await expect(run(fake, [CLAIM], { personas: ['wraith', id] })).rejects.toBeInstanceOf(UnknownPersonaError);
      expect(fake.calls).toHaveLength(0);
    }
  });

  it('writes plans/<criterion>__<persona>.json for every pair', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'compile-out-'));
    const res = await run(valid(), [CLAIM, NOWHERE], { outDir });
    const files = (await readdir(join(outDir, 'plans'))).sort();
    expect(files).toEqual(
      ['3.2__banshee', '3.2__doppelganger', '3.2__wraith', '9.1__banshee', '9.1__doppelganger', '9.1__wraith'].map((f) => `${f}.json`),
    );
    const wraith = JSON.parse(await readFile(join(outDir, 'plans', '3.2__wraith.json'), 'utf8'));
    expect(wraith).toEqual(res.pairs.find((p) => p.criterion === '3.2' && p.persona === 'wraith'));
  });

  it('pairs keep criteria × persona order and onPlan sees each pair', async () => {
    const seen: string[] = [];
    const fake = fakeLlm(async (req) => {
      await new Promise((r) => setTimeout(r, req.meta.persona === 'wraith' ? 15 : 1));
      return output(VALID[req.meta.persona]);
    });
    const res = await run(fake, [CLAIM, NOWHERE], { onPlan: (p) => seen.push(`${p.criterion}/${p.persona}`) });
    expect(res.pairs.map((p) => `${p.criterion}/${p.persona}`)).toEqual([
      '3.2/wraith', '3.2/banshee', '3.2/doppelganger', '9.1/wraith', '9.1/banshee', '9.1/doppelganger',
    ]);
    expect(seen.sort()).toEqual(res.pairs.map((p) => `${p.criterion}/${p.persona}`).sort());
  });

  it('a cache hit for the same text under a new id is stamped with the new id', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'compile-cache-'));
    await run(valid(), [CLAIM], { cacheDir, personas: ['wraith'] });
    const renumbered = criterion('7.1', CLAIM.text);
    const res = await run(valid(), [renumbered], { cacheDir, personas: ['wraith'] });
    const p = res.pairs[0]!;
    expect(p).toMatchObject({ status: 'compiled', cached: true, criterion: '7.1' });
    if (p.status !== 'compiled') throw new Error();
    expect(p.plan.criterion).toBe('7.1');
  });

  it('CompilerError stops queued pairs: no more calls, writes or onPlan after rejection', async () => {
    const criteria = Array.from({ length: 10 }, (_, i) => criterion(`6.${i + 1}`, `THE Market SHALL let a user claim Sour Skulls, case ${i}.`));
    const fake = fakeLlm(async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw new CompilerError('bad key');
    });
    const outDir = await mkdtemp(join(tmpdir(), 'compile-out-'));
    const seen: string[] = [];
    await expect(run(fake, criteria, { outDir, onPlan: (p) => seen.push(p.criterion) })).rejects.toBeInstanceOf(CompilerError);
    const callsAtReject = fake.calls.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(callsAtReject).toBeLessThanOrEqual(4);
    expect(fake.calls.length).toBe(callsAtReject);
    expect(seen).toEqual([]);
    expect(await readdir(join(outDir, 'plans'))).toEqual([]);
  });
});

describe('compile: options for summon (F09, KI-35)', () => {
  it('recompile skips cache reads but still writes the cache', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'compile-cache-'));
    await run(valid(), [CLAIM], { personas: ['wraith'], cacheDir });
    const before = await readdir(cacheDir);
    const again = valid();
    const res = await run(again, [CLAIM], { personas: ['wraith'], cacheDir, recompile: true });
    expect(again.calls.length).toBe(1);
    expect(res.cacheHits).toBe(0);
    expect(res.pairs[0]).toMatchObject({ status: 'compiled', cached: false });
    expect(await readdir(cacheDir)).toEqual(before);
  });

  it('rejects duplicate persona ids before any work', async () => {
    const fake = valid();
    await expect(run(fake, [CLAIM], { personas: ['wraith', 'wraith'] })).rejects.toThrow(/duplicate persona id: wraith/);
    expect(fake.calls).toHaveLength(0);
  });

  it('keeps the result and warns when the cache write fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'compile-cache-'));
    const file = join(dir, 'not-a-dir');
    await writeFile(file, 'x');
    const warnings: string[] = [];
    const res = await run(valid(), [CLAIM], { personas: ['wraith'], cacheDir: file, onWarning: (m) => warnings.push(m) });
    expect(res.pairs[0]).toMatchObject({ status: 'compiled' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^cache write failed:/);
  });

  it('keeps the result and warns when plan files cannot be written', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'compile-out-'));
    await writeFile(join(outDir, 'plans'), 'x');
    const warnings: string[] = [];
    const res = await run(valid(), [CLAIM], { personas: ['wraith'], outDir, onWarning: (m) => warnings.push(m) });
    expect(res.pairs[0]).toMatchObject({ status: 'compiled' });
    expect(warnings.some((w) => /^plan write failed:/.test(w))).toBe(true);
  });
});
